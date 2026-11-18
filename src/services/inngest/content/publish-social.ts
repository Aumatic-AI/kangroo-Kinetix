import type { SupabaseClient } from "@supabase/supabase-js";
import { inngest } from "../client";
import { env } from "@/config/env";
import type { Database } from "@/types/supabase";
import { UploadPostService } from "@/services/upload-post";
import { publishClaimedPost, reconcileUnknownPosts, type PublishDeps, type PublishResult } from "@/services/content-automation/publish";
import { planAutomationPosts, platformsFor, type PlanRevision } from "@/services/content-automation/schedule-posts";
import type { ProposedSlot } from "@/services/content-automation/schedule";
import { supabase, rpc, type Step } from "./shared";

/**
 * Live social publishing (TikTok / Instagram / Facebook / LinkedIn).
 *
 * 1. When a LIVE social or LinkedIn creative finishes generating,
 *    `kickSocialPublishing` creates one `social_posts` row per platform at the
 *    AI-proposed time (`scheduleCreativePosts`) and sends a `content/publish-post`
 *    event timed for that moment.
 * 2. `publishSocialPost` claims exactly that post (`claim_publish_jobs` with
 *    p_post_id — it only succeeds when the post is due and every check passes) and
 *    runs the tested worker in `publish.ts`: re-checks, Upload-Post call, ids saved
 *    before interpretation, unknown outcomes never retried.
 * 3. `contentAutomationSweep` (every 15 min) is the safety net: dead leases →
 *    unknown, unknown → reconciled by Upload-Post id, due posts whose event was
 *    lost, Live creatives missing their posts, stuck blog publications, and a
 *    stalled generation queue.
 *
 * Testing content never reaches any of this: the DB guard refuses a social_posts
 * row for it, and publish_block_reason re-checks Live mode before every call.
 */

const db = supabase as unknown as SupabaseClient<Database>;

function publishDeps(worker: string): PublishDeps {
  if (!env.UPLOAD_POST_PROFILE) throw new Error("UPLOAD_POST_PROFILE is not configured");
  return { db, uploadPost: UploadPostService, profile: env.UPLOAD_POST_PROFILE, worker, pollAttempts: 2, pollIntervalMs: 5_000 };
}

export interface ScheduledPost { id: string; platform: string; status: string; scheduledAt: string }

/** Creates the missing publishing records for one creative. Idempotent (one row per creative × platform). */
export async function scheduleCreativePosts(contentId: string): Promise<{ created: ScheduledPost[]; skipped: { platform: string; reason: string }[]; notEligible: string | null }> {
  const { data: pc } = await supabase.from("property_content")
    .select("id, business_id, pipeline_type, content_type, environment, archived_at, generation_status, current_revision_id").eq("id", contentId).single();
  if (!pc) return { created: [], skipped: [], notEligible: "content_not_found" };
  if (pc.environment !== "live" || !platformsFor(pc.pipeline_type).length) return { created: [], skipped: [], notEligible: "not_live_social" };

  const [{ data: rev }, { data: conns }, { data: existing }, { data: settings }] = await Promise.all([
    pc.current_revision_id
      ? supabase.from("content_revisions").select("id, validation_status, caption, hashtags, proposed_schedule, content_decision").eq("id", pc.current_revision_id).single()
      : Promise.resolve({ data: null }),
    supabase.from("platform_connections").select("id, platform, status").eq("business_id", pc.business_id).eq("account_kind", "upload_post"),
    supabase.from("social_posts").select("platform").eq("property_content_id", contentId),
    supabase.from("content_automation_settings").select("is_enabled, automation_mode").eq("business_id", pc.business_id).maybeSingle(),
  ]);
  const revision: PlanRevision | null = rev ? {
    id: rev.id, validation: rev.validation_status, caption: rev.caption, hashtags: rev.hashtags,
    proposedSchedule: (rev.proposed_schedule ?? null) as ProposedSlot[] | null,
    platformPosts: ((rev.content_decision as { platformPosts?: PlanRevision["platformPosts"] } | null)?.platformPosts) ?? null,
  } : null;

  const plan = planAutomationPosts({
    content: {
      pipeline: pc.pipeline_type, contentType: pc.content_type, environment: pc.environment, archived: !!pc.archived_at,
      generationStatus: pc.generation_status, currentRevisionId: pc.current_revision_id,
    },
    revision,
    connections: (conns ?? []) as { id: string; platform: string; status: string }[],
    existingPlatforms: (existing ?? []).map((e) => e.platform as string),
    live: !!settings && settings.is_enabled && settings.automation_mode === "live",
    now: Date.now(),
  });

  const created: ScheduledPost[] = [];
  for (const p of plan.posts) {
    const { data, error } = await supabase.from("social_posts").insert({
      business_id: pc.business_id, property_content_id: pc.id, content_revision_id: revision!.id,
      platform: p.platform, connection_id: p.connectionId, format: p.format, status: p.status,
      scheduled_at: p.scheduledAt, schedule_timezone: p.timezone, next_attempt_at: p.scheduledAt,
      caption: p.caption, hashtags: p.hashtags, environment: "live",
      platform_metadata: p.rescheduled ? { rescheduled: true, reason: "the proposed time had passed when the creative finished" } : {},
    }).select("id, status, scheduled_at").single();
    if (error) {
      if (error.code === "23505") continue;   // a concurrent run (sweep vs. job) created it first
      throw new Error(`could not schedule the ${p.platform} post: ${error.message}`);
    }
    created.push({ id: data.id, platform: p.platform, status: data.status, scheduledAt: data.scheduled_at as string });
  }
  return { created, skipped: plan.skipped, notEligible: plan.notEligible };
}

const publishEvent = (p: { id: string; scheduledAt: string }) => ({
  name: "content/publish-post" as const,
  data: { postId: p.id },
  ts: Math.max(Date.now(), Date.parse(p.scheduledAt)),
});

/** After a Live social/LinkedIn creative completes: create its posts and time an event for each. */
export async function kickSocialPublishing(step: Step, contentId: string) {
  const res = await step.run("schedule-posts", () => scheduleCreativePosts(contentId));
  const due = res.created.filter((p) => p.status === "scheduled");
  if (due.length) await step.sendEvent("publish-at-scheduled-times", due.map(publishEvent));
  return res;
}

export const publishSocialPost = inngest.createFunction(
  // Concurrency 2 keeps Upload-Post calls modest. Retries are safe: a re-run's claim
  // finds the post no longer 'scheduled' and does nothing.
  { id: "content-publish-post", triggers: [{ event: "content/publish-post" }], concurrency: { limit: 2 }, retries: 1 },
  async ({ event, step }) => {
    const { postId } = event.data as { postId: string };
    const worker = `inngest-${event.id ?? postId}`;

    const result = (await step.run("claim-and-publish", async (): Promise<PublishResult | { postId: string; outcome: "not_claimed" }> => {
      // Configuration first: claiming a post we then can't send would leave it 'publishing' and,
      // after its lease, wrongly flagged as "may have posted". This throws (visible in Inngest),
      // the post stays scheduled, and the Dashboard reports both the config and the overdue post.
      const deps = publishDeps(worker);
      // Claims only if it is due, not in backoff, and publish_block_reason passes.
      const { data, error } = await db.rpc("claim_publish_jobs", { p_worker: worker, p_limit: 1, p_post_id: postId });
      if (error) throw new Error(`claim_publish_jobs: ${error.message}`);
      const row = (data ?? [])[0];
      if (!row) return { postId, outcome: "not_claimed" };
      return publishClaimedPost(deps, row);
    })) as PublishResult | { postId: string; outcome: "not_claimed" };

    // Not claimed: if it's still scheduled but not due yet (the event arrived a moment early, or the
    // post is in retry backoff), come back exactly when it is due instead of waiting for the sweep.
    if (result.outcome === "not_claimed") {
      const dueAt = await step.run("due-at", async () => {
        const { data } = await supabase.from("social_posts").select("status, scheduled_at, next_attempt_at").eq("id", postId).single();
        if (data?.status !== "scheduled") return null;
        const due = Math.max(Date.parse(data.scheduled_at as string) || 0, Date.parse(data.next_attempt_at as string) || 0);
        return due > Date.now() ? due : null;   // already due but refused: blocked — the Dashboard shows why
      });
      if (dueAt) await step.sendEvent("retry-when-due", { name: "content/publish-post", data: { postId }, ts: dueAt + 1_000 });
      return result;
    }

    // A retryable failure went back to 'scheduled' with backoff: come back when it's due.
    if ("outcome" in result && result.outcome === "retry_scheduled") {
      const at = await step.run("retry-at", async () => {
        const { data } = await supabase.from("social_posts").select("next_attempt_at").eq("id", postId).single();
        return (data?.next_attempt_at as string | undefined) ?? new Date(Date.now() + 5 * 60_000).toISOString();
      });
      await step.sendEvent("retry-when-due", { name: "content/publish-post", data: { postId }, ts: Date.parse(at) });
    }
    return result;
  }
);

/** Safety net for everything event-driven above (and for blogs and generation). Every 15 minutes. */
export const contentAutomationSweep = inngest.createFunction(
  { id: "content-automation-sweep", triggers: [{ cron: "*/15 * * * *" }], concurrency: { limit: 1 }, retries: 1 },
  async ({ step }) => {
    const found = await step.run("sweep", async () => {
      const now = new Date().toISOString();

      // 1–2. Dead publish leases become 'unknown' (never re-sent), then unknowns are
      // resolved against Upload-Post by the ids saved before interpretation.
      await rpc("recover_stale_publishing", {});
      let reconciled = { resolved: 0, stillUnknown: 0 };
      if (env.UPLOAD_POST_PROFILE) reconciled = await reconcileUnknownPosts(publishDeps("sweep"));

      // 3. Live social/LinkedIn creatives of the last 8 days that are missing posts (e.g. the
      //    job's scheduling step failed). scheduleCreativePosts only adds what's missing.
      const since = new Date(Date.now() - 8 * 86_400_000).toISOString();
      const { data: live } = await supabase.from("property_content").select("id, pipeline_type, social_posts(platform)")
        .eq("environment", "live").in("pipeline_type", ["social", "linkedin"]).eq("generation_status", "completed")
        .is("archived_at", null).not("current_revision_id", "is", null).gte("created_at", since).limit(100);
      const newlyScheduled: { id: string; scheduledAt: string }[] = [];
      for (const c of (live ?? []) as { id: string; pipeline_type: string; social_posts: { platform: string }[] }[]) {
        if ((c.social_posts?.length ?? 0) >= platformsFor(c.pipeline_type).length) continue;
        try {
          const r = await scheduleCreativePosts(c.id);
          newlyScheduled.push(...r.created.filter((p) => p.status === "scheduled"));
        } catch (e) {
          console.error("[CONTENT_SWEEP] scheduling", c.id, e instanceof Error ? e.message : e);
        }
      }

      // 4. Due posts (their timed event was lost, or they were released after a pause).
      const { data: due } = await supabase.from("social_posts").select("id")
        .not("property_content_id", "is", null).eq("status", "scheduled")
        .lte("scheduled_at", now).lte("next_attempt_at", now).limit(50);

      // 5. Blog publications that are due, or whose worker died mid-publish.
      const [{ data: blogDue }, { data: blogStale }] = await Promise.all([
        supabase.from("blog_publications").select("id").eq("status", "pending").lte("next_attempt_at", now).limit(50),
        supabase.from("blog_publications").select("id").eq("status", "publishing").lt("locked_until", now).limit(50),
      ]);

      // 6. Generation that stalled: claimable jobs nobody is working on (only while some business has
      //    automation enabled — claim_generation_jobs would refuse them otherwise).
      const { count: enabled } = await supabase.from("content_automation_settings").select("business_id", { count: "exact", head: true }).eq("is_enabled", true);
      const [{ count: pending }, { count: expired }] = enabled ? await Promise.all([
        supabase.from("content_generation_queue").select("id", { count: "exact", head: true }).eq("generation_status", "pending").lte("next_attempt_at", now),
        supabase.from("content_generation_queue").select("id", { count: "exact", head: true }).eq("generation_status", "processing").lt("locked_until", now),
      ]) : [{ count: 0 }, { count: 0 }];

      return {
        reconciled,
        newlyScheduled,
        due: (due ?? []).map((d) => d.id as string),
        blogs: [...(blogDue ?? []), ...(blogStale ?? [])].map((b) => b.id as string),
        kickGeneration: (pending ?? 0) + (expired ?? 0) > 0,
      };
    });

    const events = [
      ...found.newlyScheduled.map(publishEvent),
      ...found.due.map((id) => ({ name: "content/publish-post" as const, data: { postId: id } })),
      ...found.blogs.map((id) => ({ name: "content/blog-publish" as const, data: { publicationId: id } })),
      ...(found.kickGeneration ? [{ name: "content/process-queue" as const, data: {} }] : []),
    ];
    if (events.length) await step.sendEvent("dispatch", events);
    return { ...found.reconciled, scheduled: found.newlyScheduled.length, due: found.due.length, blogs: found.blogs.length, kickedGeneration: found.kickGeneration };
  }
);
