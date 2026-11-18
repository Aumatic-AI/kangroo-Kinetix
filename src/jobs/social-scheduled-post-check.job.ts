import { inngest } from "@/services/inngest/client";
import { createClient } from "@supabase/supabase-js";
import { UploadPostService } from "@/services/upload-post";
import { env } from "@/config";

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Upload-Post fires scheduled posts itself, and can fall back to
 * background processing for anything slow (typically video) even on an
 * immediate publish — either way, our own publish route has already moved
 * on by the time it actually finishes. This is what closes the loop, but
 * one instance per post instead of a blind recurring cron: fired once,
 * right when the post is scheduled/queued, it sleeps at zero cost until
 * the moment it's actually due, then polls Upload-Post a handful of times
 * to find the real outcome. A post scheduled a month out costs exactly
 * one dormant function the whole time, not thousands of empty cron ticks.
 */
export const socialScheduledPostCheck = inngest.createFunction(
  { id: "jobs-social-scheduled-post-check", triggers: [{ event: "social/scheduled-post-created" }] },
  async ({ event, step }) => {
    const { socialPostId, checkAt, jobId, requestId } = event.data as {
      socialPostId: string;
      /** ISO timestamp — when to start checking (the scheduled_date for a
       * scheduled post, ~now for an immediate async publish). */
      checkAt: string;
      jobId?: string;
      requestId?: string;
    };

    await step.sleepUntil("wait-until-due", checkAt);

    const MAX_ATTEMPTS = 10; // 30s apart => up to 5 minutes of checking after the due time
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const resolved = await step.run(`check-${attempt}`, async () => {
        const { data: post } = await supabase.from("social_posts")
          .select("status, property_content_id, upload_post_job_id, upload_post_request_id").eq("id", socialPostId).single();
        if (!post || (post.status !== "scheduled" && post.status !== "publishing")) {
          return true; // already resolved, cancelled, or retried elsewhere — nothing left to do
        }
        // Automation posts are reconciled by the content-automation worker, never here.
        if (post.property_content_id !== null) return true;
        // A check for an EARLIER schedule of this post (cancelled, then rescheduled with a new job)
        // must not judge the new one by the old, cancelled job.
        if ((jobId && post.upload_post_job_id !== jobId) || (!jobId && requestId && post.upload_post_request_id !== requestId)) return true;

        const status = jobId
          ? await UploadPostService.getUploadStatus({ jobId })
          : await UploadPostService.getUploadStatus({ requestId });

        if (status.status === "completed") {
          const result = status.results?.[0];
          if (result && result.success === false) {
            await supabase.from("social_posts").update({ status: "failed", error_message: result.message || "Publish failed" }).eq("id", socialPostId);
          } else {
            await supabase.from("social_posts").update({ status: "published", published_at: new Date().toISOString(), error_message: null }).eq("id", socialPostId);
          }
          return true;
        }
        if (status.status === "failed") {
          await supabase.from("social_posts").update({ status: "failed", error_message: status.results?.[0]?.message || "Publish failed" }).eq("id", socialPostId);
          return true;
        }
        return false; // still pending/queued/processing — check again
      });

      if (resolved) return { socialPostId, resolved: true };
      if (attempt < MAX_ATTEMPTS - 1) await step.sleep(`wait-${attempt}`, "30s");
    }

    // Still not final after 5 minutes of checking. Don't leave it silent: say so on the post (the
    // Dashboard lists Social posts stuck publishing or unconfirmed after their time).
    await step.run("record-timeout", async () => {
      await supabase.from("social_posts")
        .update({ error_message: "Upload-Post hadn't confirmed this post 5 minutes after its time. Check the account before doing anything else." })
        .eq("id", socialPostId).in("status", ["scheduled", "publishing"]).is("property_content_id", null);
    });
    return { socialPostId, resolved: false, timedOut: true };
  }
);
