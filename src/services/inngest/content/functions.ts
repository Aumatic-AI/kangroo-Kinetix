import { inngest } from "../client";
import { generateCreative } from "./generate-creative";
import { supabase, rpc, isPermanentError, cleanErrorMessage } from "./shared";
import { addDays, mondayOf } from "@/services/content-automation/schedule";
import { planCycleWeek } from "@/services/content-automation/plan-week";

/**
 * Content-automation generation functions.
 *
 * Nothing here runs on its own except the weekly cron, which is gated by
 * content_automation_settings.auto_run_enabled (default false) — so during the
 * testing phase generation only starts from the manual "Generate now" button
 * (POST /api/content/trigger → content/process-queue) or a gallery regenerate.
 * No function here ever publishes: output only reaches the gallery tables.
 */

/** Claims pending queue jobs (only while automation is enabled and the cycle's
 * environment matches the current mode — enforced inside claim_generation_jobs)
 * and fans each out to its own durable generate-job run. */
export const processContentQueue = inngest.createFunction(
  { id: "content-process-queue", triggers: [{ event: "content/process-queue" }], concurrency: { limit: 1 }, retries: 2 },
  async ({ event, step }) => {
    const worker = `inngest-${event.id ?? Date.now()}`;
    const jobs = (await step.run("claim", async () => {
      const claimed = await rpc<{ id: string }[] | null>("claim_generation_jobs", { p_worker: worker, p_limit: 5 });
      return (claimed ?? []).map((j) => ({ id: j.id }));
    })) as { id: string }[];
    if (!jobs.length) return { claimed: 0 };
    await step.sendEvent("dispatch", jobs.map((j) => ({ name: "content/generate-job", data: { queueId: j.id, worker } })));
    return { claimed: jobs.length };
  }
);

export const generateContentJob = inngest.createFunction(
  { id: "content-generate-job", triggers: [{ event: "content/generate-job" }], concurrency: { limit: 3 }, retries: 2 },
  async ({ event, step }) => {
    const { queueId, worker } = event.data as { queueId: string; worker: string };

    const job = await step.run("load-job", async () => {
      const { data: q } = await supabase.from("content_generation_queue")
        .select("id, business_id, cycle_id, property_id, pipeline_type, slot_index, content_type, generation_status, locked_by, generation_attempts")
        .eq("id", queueId).single();
      if (!q || q.generation_status !== "processing" || q.locked_by !== worker || !q.property_id) return null;
      const { data: c } = await supabase.from("content_generation_cycles").select("environment").eq("id", q.cycle_id).single();
      return { ...q, environment: (c?.environment ?? "testing") as "testing" | "live" };
    });
    if (!job) return { skipped: true };

    try {
      const result = await generateCreative(step, {
        mode: "job", businessId: job.business_id, propertyId: job.property_id!, pipeline: job.pipeline_type as "social" | "linkedin" | "blog",
        cycleId: job.cycle_id, environment: job.environment, queueId, slotIndex: job.slot_index, worker,
        // A social job's image/video type is chosen by the user (Generate now / weekly frequencies) and set
        // on the queue row when it's created. NULL (older jobs) leaves the choice to the AI.
        forceType: job.pipeline_type === "social" && (job.content_type === "image" || job.content_type === "video") ? job.content_type : null,
      });
      await step.run("complete-job", () => rpc("complete_generation_job", { p_queue: queueId, p_worker: worker }));
      await step.sendEvent("next-batch", { name: "content/process-queue", data: {} });
      return { status: "completed", ...result };
    } catch (e) {
      const message = cleanErrorMessage(e);
      const permanent = isPermanentError(e);
      const outcome = (await step.run("fail-job", async () => {
        try {
          const status = await rpc<string>("fail_generation_job", { p_queue: queueId, p_worker: worker, p_error: message, p_retryable: !permanent });
          if (status === "failed") {
            await supabase.from("property_content").update({ generation_status: "failed" }).eq("queue_id", queueId).neq("generation_status", "completed");
          }
          return { status, attempts: job.generation_attempts };
        } catch {
          return { status: "lost", attempts: job.generation_attempts }; // another worker owns it now
        }
      })) as { status: string; attempts: number };
      if (outcome.status === "pending") {
        // Same backoff as fail_generation_job: 2 min × attempts.
        await step.sendEvent("retry-later", { name: "content/process-queue", data: {}, ts: Date.now() + 2 * 60_000 * Math.max(1, outcome.attempts) });
      } else {
        await step.sendEvent("next-batch", { name: "content/process-queue", data: {} });
      }
      return { status: outcome.status, error: message };
    }
  }
);

/** Gallery "Regenerate": request_content_regeneration already created a pending
 * revision; this fills it. The current (valid) revision stays current — and
 * stays what the gallery shows — until the new one validates. */
export const regenerateContentRevision = inngest.createFunction(
  { id: "content-regenerate-revision", triggers: [{ event: "content/regenerate-requested" }], concurrency: { limit: 2 }, retries: 2 },
  async ({ event, step }) => {
    const { contentId, revisionId } = event.data as { contentId: string; revisionId: string };

    const ctx = await step.run("load", async () => {
      const { data: pc } = await supabase.from("property_content")
        .select("business_id, property_id, cycle_id, pipeline_type, content_type, environment").eq("id", contentId).single();
      const { data: rev } = await supabase.from("content_revisions").select("validation_status, generation_prompt").eq("id", revisionId).single();
      if (!pc || !rev || rev.validation_status !== "pending") return null;
      await supabase.from("property_content").update({ generation_status: "processing" }).eq("id", contentId);
      return { ...pc, guidance: rev.generation_prompt as string | null };
    });
    if (!ctx) return { skipped: true };

    try {
      const result = await generateCreative(step, {
        mode: "regen", businessId: ctx.business_id, propertyId: ctx.property_id, pipeline: ctx.pipeline_type as "social" | "linkedin" | "blog",
        cycleId: ctx.cycle_id, environment: ctx.environment as "testing" | "live", contentId, revisionId, guidance: ctx.guidance,
        forceType: ctx.pipeline_type === "social" ? (ctx.content_type as "image" | "video") : null,
      });
      return { status: "completed", ...result };
    } catch (e) {
      const message = cleanErrorMessage(e);
      await step.run("mark-failed", async () => {
        // The failed revision becomes invalid (so another regeneration can be requested);
        // the creative returns to 'completed' because its previous valid revision is intact.
        await supabase.from("content_revisions").update({ validation_status: "invalid", validation_errors: [message] })
          .eq("id", revisionId).eq("validation_status", "pending");
        const { data: pc } = await supabase.from("property_content").select("current_revision_id").eq("id", contentId).single();
        await supabase.from("property_content").update({ generation_status: pc?.current_revision_id ? "completed" : "failed" }).eq("id", contentId);
      });
      return { status: "failed", error: message };
    }
  }
);

/**
 * Weekly cycle — Friday 18:00 America/Toronto (decided 2026-11-03). Does
 * NOTHING unless a business has explicitly turned auto_run_enabled on (default
 * off), so it is in place but never starts automatically during testing. When it
 * does run it creates the cycle from the saved frequencies, PLANS THE WHOLE WEEK'S
 * posting days/times in one go (plan-week.ts), then starts generation.
 */
export const weeklyContentCycle = inngest.createFunction(
  { id: "content-weekly-cycle", triggers: [{ cron: "TZ=America/Toronto 0 18 * * 5" }], retries: 1 },
  async ({ step }) => {
    const created = await step.run("create-cycles", async () => {
      const { data: rows } = await supabase.from("content_automation_settings")
        .select("business_id, automation_mode, social_image_frequency_per_week, social_video_frequency_per_week, linkedin_frequency_per_week, blog_frequency_per_week, generation_timezone")
        .eq("is_enabled", true).eq("auto_run_enabled", true);
      const out: { businessId: string; cycleId: string }[] = [];
      for (const s of rows ?? []) {
        const social = s.social_image_frequency_per_week + s.social_video_frequency_per_week;
        if (social + s.linkedin_frequency_per_week + s.blog_frequency_per_week < 1) continue;
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: s.generation_timezone }).format(new Date());
        const weekStart = addDays(mondayOf(today), 7);   // the FOLLOWING Monday-start week
        await supabase.from("content_generation_cycles").upsert(
          { business_id: s.business_id, environment: s.automation_mode, week_start: weekStart,
            // ensure_cycle_slots gives each social slot its type, spreading the videos through the week.
            social_target_count: social, social_video_target_count: s.social_video_frequency_per_week,
            linkedin_target_count: s.linkedin_frequency_per_week,
            blog_target_count: s.blog_frequency_per_week },
          { onConflict: "business_id,environment,week_start", ignoreDuplicates: true });
        const { data: cycle } = await supabase.from("content_generation_cycles").select("id")
          .eq("business_id", s.business_id).eq("environment", s.automation_mode).eq("week_start", weekStart).single();
        if (cycle) { await rpc("ensure_cycle_slots", { p_cycle: cycle.id }); out.push({ businessId: s.business_id, cycleId: cycle.id }); }
      }
      return out;
    });
    // Plan the whole week's days/times BEFORE any job starts, so jobs take their assigned slot
    // (they run in parallel and can't coordinate). A planner failure must never block generation:
    // jobs then fall back to choosing a slot for their own creative.
    for (const c of created) {
      await step.run(`plan-week-${c.cycleId}`, async () => {
        try { return await planCycleWeek(supabase, c.cycleId); }
        catch (e) { console.error("[CONTENT_PLAN]", e instanceof Error ? e.message : e); return { social: 0, linkedin: 0, failed: true }; }
      });
    }
    if (created.length) await step.sendEvent("kick", { name: "content/process-queue", data: {} });
    return { cycles: created.length };
  }
);
