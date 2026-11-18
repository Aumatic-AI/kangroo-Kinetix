import { aiOrchestrator } from "@/services/ai/orchestrator";
import { parseAgentJson } from "@/services/content-automation/agents";
import { minSamePlatformGapMs, schedulingWindow, validateProposedSchedule, type PlannedPost, type ProposedSlot } from "@/services/content-automation/schedule";
import { getSchedulePrompt } from "@/prompts/content-automation";
import { supabase } from "./shared";

export type SchedulePipeline = "social" | "linkedin" | "blog";

/** The schedule "platforms" of a pipeline. A blog has one slot, platform "blog" (its WordPress publish time). */
export function schedulePlatforms(pipeline: SchedulePipeline, socialPlatforms: readonly string[]): string[] {
  return pipeline === "linkedin" ? ["linkedin"] : pipeline === "blog" ? ["blog"] : [...socialPlatforms];
}

/**
 * When a creative goes out: one slot per platform, saved on the revision as
 * `proposed_schedule`. Shared by social, LinkedIn and blog creatives.
 *
 * Preferred: the slot the weekly planner already chose for this job's position, so the
 * week is balanced across all posts. A regeneration keeps the creative's existing slot.
 * Otherwise (e.g. the manual trigger, no plan) the AI proposes for this creative alone
 * and the validator enforces the rules against what other creatives already hold.
 */
export async function chooseSchedule(args: {
  mode: "job" | "regen";
  cycleId: string | null;
  slotIndex?: number | null;
  pipeline: SchedulePipeline;
  contentId: string;
  platforms: string[];
  weekStart: string;
  timezone: string;
  contentType: string;
  city: string | null;
}): Promise<ProposedSlot[]> {
  const { platforms } = args;

  if (args.mode === "job" && args.cycleId && args.slotIndex) {
    // Tolerant read: a missing column or no plan just means "fall back", never a failure.
    const { data, error } = await supabase.from("content_generation_cycles").select("week_plan").eq("id", args.cycleId).single();
    const weekPlan = !error ? (data?.week_plan as Partial<Record<SchedulePipeline, PlannedPost[]>> | null) : null;
    const entry = weekPlan?.[args.pipeline]?.find((x) => x.slot_index === args.slotIndex);
    if (entry?.slots?.length && platforms.every((pf) => entry.slots.some((s) => s.platform === pf))) {
      return entry.slots.map((s) => ({ ...s, source: "week_plan" as const }));
    }
  } else if (args.mode === "regen") {
    const { data: pc } = await supabase.from("property_content").select("current_revision_id").eq("id", args.contentId).single();
    if (pc?.current_revision_id) {
      const { data: prev } = await supabase.from("content_revisions").select("proposed_schedule").eq("id", pc.current_revision_id).single();
      if (Array.isArray(prev?.proposed_schedule) && prev.proposed_schedule.length) return prev.proposed_schedule as ProposedSlot[];
    }
  }

  const taken: { platform: string; ms: number }[] = [];
  const existingLocal: { platform: string; local: string }[] = [];
  // Same-platform spacing follows how many posts this pipeline makes this week (two a day above 7).
  let postsPerWeek = 0;
  if (args.cycleId) {
    const { data: cyc } = await supabase.from("content_generation_cycles")
      .select("social_target_count, linkedin_target_count, blog_target_count").eq("id", args.cycleId).single();
    postsPerWeek = (args.pipeline === "linkedin" ? cyc?.linkedin_target_count : args.pipeline === "blog" ? cyc?.blog_target_count : cyc?.social_target_count) ?? 0;
    const { data: others } = await supabase.from("property_content").select("id").eq("cycle_id", args.cycleId).neq("id", args.contentId);
    if (others?.length) {
      const { data: revs } = await supabase.from("content_revisions").select("proposed_schedule")
        .in("property_content_id", others.map((o) => o.id)).not("proposed_schedule", "is", null);
      for (const r of revs ?? []) for (const s of (r.proposed_schedule as ProposedSlot[]) ?? []) {
        taken.push({ platform: s.platform, ms: Date.parse(s.scheduled_at) });
        existingLocal.push({ platform: s.platform, local: s.local });
      }
    }
  }
  // Never in the past: if the cycle's week has already started (Live "Generate now" adds to the
  // current week), schedule in the 7 days from today instead, from 30 minutes from now.
  const window = schedulingWindow(args.weekStart, Date.now(), args.timezone);
  let raw: unknown = null;
  try {
    const { system, user } = getSchedulePrompt({
      weekStart: window.start, timezone: args.timezone, pipeline: args.pipeline, platforms,
      contentType: args.contentType, city: args.city, existing: existingLocal,
    });
    raw = parseAgentJson(await aiOrchestrator.executeTask("analysis", user, "openai", { systemPrompt: system }));
  } catch (e) {
    console.warn("[CONTENT_SCHEDULE] AI proposal unavailable, using defaults:", e instanceof Error ? e.message : e);
  }
  return validateProposedSchedule({ weekStart: window.start, timezone: args.timezone, platforms, raw, taken, minGapMs: minSamePlatformGapMs(postsPerWeek), notBeforeMs: window.notBeforeMs })
    .map((s) => ({ ...s, source: "per_creative" as const }));
}
