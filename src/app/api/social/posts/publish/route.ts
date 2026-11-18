import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { env } from "@/config/env";
import { UploadPostService, UploadPostPlatform } from "@/services/upload-post";
import { inngest } from "@/services/inngest/client";
import { UploadPostHttpError } from "@/services/upload-post/client";

interface PublishRequestBody {
  socialPostIds: string[];
  /** Presence alone schedules instead of publishing immediately. */
  scheduledDate?: string;
  timezone?: string;
}

/** Statuses a manual post can be published from. Anything else is already
 * scheduled, publishing, published, or failed (failed goes through Retry). */
const PUBLISHABLE = ["draft", "review", "approved"];

/** A received 4xx (except 408/429) means Upload-Post definitely refused it. Anything
 * else — no response, timeout, 5xx — may have been processed, so it may be live. */
function definitelyRejected(e: unknown): boolean {
  return e instanceof UploadPostHttpError && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429;
}

/**
 * Publishes (or schedules) each social_posts row through Upload-Post.
 * Each row publishes independently — one platform failing must not block
 * or roll back the others (see docs/modules/social_media.md).
 *
 * Never twice: each row is CLAIMED first (an atomic draft → publishing update),
 * and only the request that wins the claim calls Upload-Post. A double click, a
 * second tab, a retried request or a re-selected platform finds the row no longer
 * publishable and is skipped. After Upload-Post has accepted a post, nothing here
 * can turn it back into something publishable: bookkeeping failures are logged
 * and the row stays 'publishing' (never 'failed', which Retry would resend).
 */
export async function POST(request: Request) {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const body: PublishRequestBody = await request.json();

    if (!Array.isArray(body.socialPostIds) || !body.socialPostIds.length) {
      return NextResponse.json({ error: "Missing required field: socialPostIds" }, { status: 400 });
    }

    const username = env.UPLOAD_POST_PROFILE;
    if (!username) throw new Error("UPLOAD_POST_PROFILE is not configured");

    if (body.scheduledDate !== undefined) {
      const at = Date.parse(body.scheduledDate);
      if (!Number.isFinite(at)) return NextResponse.json({ error: "Invalid scheduledDate" }, { status: 400 });
      if (at < Date.now() + 60_000) return NextResponse.json({ error: "The scheduled time has already passed. Pick a time in the future." }, { status: 400 });
    }

    const { data: posts } = await supabase
      .from("social_posts")
      .select("id, status, caption, title, media_asset_id, connection_id, property_content_id, environment, platform_connections(platform, metadata)")
      .in("id", body.socialPostIds);

    if (!posts || !posts.length) throw new Error("Posts not found");

    // Automation posts are published ONLY by the content-automation worker,
    // which re-checks mode / property / revision / connection / idempotency.
    // Refuse before any Upload-Post call — a DB CHECK alone would reject the
    // status update only after the post had already gone out.
    if (posts.some((p) => p.property_content_id !== null || p.environment !== null)) {
      return NextResponse.json(
        { error: "Automation posts cannot be published manually. They are published automatically when Live automation is enabled." },
        { status: 409 },
      );
    }

    const results: { id: string; success: boolean; scheduled?: boolean; skipped?: boolean; error?: string }[] = [];

    for (const post of posts as any[]) {
      const connection = post.platform_connections;

      // 1. Claim. Only one request can move this row out of a publishable status.
      const { data: claimed, error: claimErr } = await supabase
        .from("social_posts")
        .update({ status: "publishing", error_message: null })
        .eq("id", post.id)
        .is("property_content_id", null)
        .in("status", PUBLISHABLE)
        .select("id");
      if (claimErr) {
        results.push({ id: post.id, success: false, error: claimErr.message });
        continue;
      }
      if (!claimed?.length) {
        results.push({ id: post.id, success: false, skipped: true, error: `Not sent: this post is already ${post.status === "draft" ? "being published" : post.status}.` });
        continue;
      }

      // 2. Before the Upload-Post call: any problem here means nothing was sent.
      let response;
      let platform: UploadPostPlatform = connection?.platform;
      let calling = false;   // true once the request to Upload-Post has started
      try {
        if (!connection) throw new Error("No platform selected for this post");

        let mediaUrl: string | null = null;
        let mediaType: "image" | "video" | null = null;
        if (post.media_asset_id) {
          const { data: asset } = await supabase.from("media_assets").select("type, metadata").eq("id", post.media_asset_id).single();
          mediaUrl = (asset?.metadata as any)?.publicUrl || null;
          mediaType = asset?.type === "video" ? "video" : asset?.type === "image" ? "image" : null;
          if (!mediaUrl || !mediaType) throw new Error("This post has no media to publish");
        }

        platform = connection.platform as UploadPostPlatform;
        const facebookPageId = (connection.metadata as any)?.facebookPageId;
        const linkedinPageId = (connection.metadata as any)?.linkedinPageId;

        // Upload-Post's `title` is the main body everywhere except YouTube,
        // which needs a real title distinct from the description — the only
        // platform where our own caption/title split actually matters to
        // their API.
        const shared = {
          user: username,
          platforms: [platform] as UploadPostPlatform[],
          title: platform === "youtube" ? (post.title || post.caption || "Untitled") : (post.caption || ""),
          description: platform === "youtube" ? (post.caption || "") : undefined,
          scheduledDate: body.scheduledDate,
          timezone: body.timezone,
          facebookPageId,
          linkedinPageId,
        };

        calling = true;
        response = mediaType === "video"
          ? await UploadPostService.publishVideo({ ...shared, videoUrl: mediaUrl as string })
          : mediaType === "image"
          ? await UploadPostService.publishPhotos({ ...shared, photoUrls: [mediaUrl as string] })
          : await UploadPostService.publishText(shared);
      } catch (e: unknown) {
        // Before or during the call. A definite rejection (or a problem before the call) means
        // nothing went out. No response / a server error may have gone out: say so, so nobody
        // resends it blindly (Retry is a deliberate, separate action).
        const reason = e instanceof Error ? e.message : String(e);
        const message = !calling || definitelyRejected(e)
          ? reason
          : `Upload-Post didn't confirm (${reason}). It may have posted. Check the ${post.platform_connections?.platform ?? ""} account before retrying.`;
        console.error(`[SOCIAL_PUBLISH_${post.id}]`, e);
        const { error: failErr } = await supabase.from("social_posts").update({ status: "failed", error_message: message.slice(0, 500) }).eq("id", post.id).eq("status", "publishing");
        if (failErr) console.error(`[SOCIAL_PUBLISH_${post.id}] could not record the failure`, failErr);
        results.push({ id: post.id, success: false, error: message });
        continue;
      }

      // 3. Upload-Post accepted the request. From here on the row must never become
      //    publishable again: record the outcome, but on any bookkeeping error just log it
      //    and leave the row 'publishing' (the scheduled-post check or a person resolves it).
      try {
        // Whether this was scheduled is OUR call, not something to infer
        // from Upload-Post's response shape — their responses can include
        // a job_id alongside a real, already-succeeded `results` object
        // even for an immediate publish, so checking job_id first (as this
        // used to) misread a live, unscheduled post as "scheduled".
        if (body.scheduledDate) {
          // Upload-Post itself fires the actual publish at scheduled_date.
          // One dormant reconciliation job wakes up right at that time to
          // record the real outcome — not a recurring cron that would
          // otherwise tick uselessly the whole time.
          const { error: upErr } = await supabase
            .from("social_posts")
            .update({ status: "scheduled", scheduled_at: body.scheduledDate, upload_post_job_id: response.job_id || null, error_message: null })
            .eq("id", post.id);
          if (upErr) throw upErr;
          if (response.job_id) {
            await inngest.send({
              name: "social/scheduled-post-created",
              data: { socialPostId: post.id, checkAt: body.scheduledDate, jobId: response.job_id },
            });
          }
          results.push({ id: post.id, success: true, scheduled: true });
          continue;
        }

        const platformResult = response.results?.[platform];
        if (platformResult) {
          if (!platformResult.success) {
            // Upload-Post answered: this platform definitely refused it.
            const message = platformResult.error || "Upload-Post reported a failure";
            const { error: upErr } = await supabase.from("social_posts").update({ status: "failed", error_message: message.slice(0, 500) }).eq("id", post.id);
            if (upErr) throw upErr;
            results.push({ id: post.id, success: false, error: message });
            continue;
          }
          const { error: upErr } = await supabase
            .from("social_posts")
            .update({ status: "published", published_at: new Date().toISOString(), error_message: null })
            .eq("id", post.id);
          if (upErr) throw upErr;
          results.push({ id: post.id, success: true });
          continue;
        }

        // Fell back to background processing (Upload-Post does this for
        // anything taking >~59s, common for video) — same dormant-until-due
        // reconciliation job, just triggered to start checking right away.
        // Some responses track this via request_id, others via job_id;
        // either works as the id to poll status with.
        const trackingId = response.request_id || response.job_id;
        if (trackingId) {
          const { error: upErr } = await supabase
            .from("social_posts")
            .update({
              status: "publishing",
              upload_post_request_id: response.request_id || null,
              upload_post_job_id: response.job_id || null,
              error_message: null,
            })
            .eq("id", post.id);
          if (upErr) throw upErr;
          await inngest.send({
            name: "social/scheduled-post-created",
            data: {
              socialPostId: post.id,
              checkAt: new Date().toISOString(),
              ...(response.request_id ? { requestId: response.request_id } : { jobId: response.job_id }),
            },
          });
          results.push({ id: post.id, success: true });
          continue;
        }

        throw new Error("Unexpected response from Upload-Post (no result and no tracking id)");
      } catch (e: any) {
        // Accepted by Upload-Post but we couldn't record or track it. Do NOT mark it failed.
        console.error(`[SOCIAL_PUBLISH_${post.id}] accepted by Upload-Post, bookkeeping failed`, e);
        await supabase.from("social_posts")
          .update({ error_message: `Sent to Upload-Post, but the result couldn't be recorded (${String(e?.message || e).slice(0, 200)}). Check the account; don't resend.` })
          .eq("id", post.id);
        results.push({ id: post.id, success: true, error: "sent, but the outcome couldn't be recorded" });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error("[SOCIAL_POSTS_PUBLISH]", error);
    return NextResponse.json({ error: error.message || "Failed to publish posts" }, { status: 500 });
  }
}
