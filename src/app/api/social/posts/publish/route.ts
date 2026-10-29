import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { env } from "@/config/env";
import { UploadPostService, UploadPostPlatform } from "@/services/upload-post";
import { inngest } from "@/services/inngest/client";

interface PublishRequestBody {
  socialPostIds: string[];
  /** Presence alone schedules instead of publishing immediately. */
  scheduledDate?: string;
  timezone?: string;
}

/**
 * Publishes (or schedules) each social_posts row through Upload-Post.
 * Each row publishes independently — one platform failing must not block
 * or roll back the others (see docs/modules/social_media.md).
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

    const { data: posts } = await supabase
      .from("social_posts")
      .select("id, caption, title, media_asset_id, connection_id, platform_connections(platform, metadata)")
      .in("id", body.socialPostIds);

    if (!posts || !posts.length) throw new Error("Posts not found");

    const results: { id: string; success: boolean; scheduled?: boolean; error?: string }[] = [];

    for (const post of posts as any[]) {
      const connection = post.platform_connections;
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

        const platform = connection.platform as UploadPostPlatform;
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

        const response = mediaType === "video"
          ? await UploadPostService.publishVideo({ ...shared, videoUrl: mediaUrl as string })
          : mediaType === "image"
          ? await UploadPostService.publishPhotos({ ...shared, photoUrls: [mediaUrl as string] })
          : await UploadPostService.publishText(shared);

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
          await supabase
            .from("social_posts")
            .update({ status: "scheduled", scheduled_at: body.scheduledDate, upload_post_job_id: response.job_id || null, error_message: null })
            .eq("id", post.id);
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
          if (!platformResult.success) throw new Error(platformResult.error || "Upload-Post reported a failure");
          await supabase
            .from("social_posts")
            .update({ status: "published", published_at: new Date().toISOString(), error_message: null })
            .eq("id", post.id);
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
          await supabase
            .from("social_posts")
            .update({
              status: "publishing",
              upload_post_request_id: response.request_id || null,
              upload_post_job_id: response.job_id || null,
              error_message: null,
            })
            .eq("id", post.id);
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

        throw new Error("Unexpected response from Upload-Post");
      } catch (e: any) {
        console.error(`[SOCIAL_PUBLISH_${post.id}]`, e);
        await supabase.from("social_posts").update({ status: "failed", error_message: String(e.message || e).slice(0, 500) }).eq("id", post.id);
        results.push({ id: post.id, success: false, error: e.message });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error("[SOCIAL_POSTS_PUBLISH]", error);
    return NextResponse.json({ error: error.message || "Failed to publish posts" }, { status: 500 });
  }
}
