import type { SupabaseClient } from "@supabase/supabase-js";
import { aiOrchestrator } from "@/services/ai/orchestrator";
import { getWeekPlanPrompt } from "@/prompts/content-automation";
import { parseAgentJson } from "./agents";
import { SOCIAL_PLATFORM_IDS } from "./platform-specs";
import { validateWeekPlan, type PlannedPost, type WeekPlan } from "./schedule";

/**
 * The weekly planner (spec §4.2, §13.6). Decides the posting days/times for the
 * WHOLE week in one go, from the configured frequency, and saves them on the
 * cycle (`week_plan`) BEFORE any job starts. Each job then takes the slot for its
 * queue position instead of choosing its own — so the posts are spread across the
 * week and the same-platform spacing holds across all of them (jobs run in
 * parallel and can't see each other's choices).
 *
 * The AI proposes; `validateWeekPlan` enforces (in-week, posting hours, spacing,
 * deterministic spread-out fallbacks). Idempotent: only posts that aren't planned
 * yet are planned, so re-running never moves an existing slot.
 *
 * Property and content type aren't known at planning time (they're assigned when
 * each job runs), so the plan uses the business timezone and spreads posts rather
 * than tailoring to a venue. Used by the weekly cron; the manual trigger doesn't.
 */
export async function planCycleWeek(
  supabase: SupabaseClient,
  cycleId: string,
): Promise<{ social: number; linkedin: number }> {
  const { data: cycle, error } = await supabase
    .from("content_generation_cycles")
    .select("id, business_id, week_start, social_target_count, linkedin_target_count, week_plan")
    .eq("id", cycleId).single();
  if (error || !cycle) throw new Error(`planCycleWeek: cycle ${cycleId} not found: ${error?.message ?? "no row"}`);

  const { data: settings } = await supabase
    .from("content_automation_settings").select("generation_timezone").eq("business_id", cycle.business_id).maybeSingle();
  const timezone = settings?.generation_timezone ?? "America/Toronto";

  const prev = (cycle.week_plan ?? {}) as Partial<WeekPlan>;
  const next: WeekPlan = { timezone, planned_at: new Date().toISOString(), social: prev.social ?? [], linkedin: prev.linkedin ?? [] };
  const added = { social: 0, linkedin: 0 };

  const pipelines = [
    { key: "social" as const, count: cycle.social_target_count, platforms: [...SOCIAL_PLATFORM_IDS] as string[] },
    { key: "linkedin" as const, count: cycle.linkedin_target_count, platforms: ["linkedin"] },
  ];

  for (const { key, count, platforms } of pipelines) {
    const existing: PlannedPost[] = next[key];
    const done = new Set(existing.map((p) => p.slot_index));
    if (count < 1 || Array.from({ length: count }, (_, i) => i + 1).every((i) => done.has(i))) continue;

    let raw: unknown = null;
    try {
      const { system, user } = getWeekPlanPrompt({
        weekStart: cycle.week_start, timezone, pipeline: key, platforms, count,
        existing: existing.map((p) => ({ slot_index: p.slot_index, summary: p.slots.map((s) => `${s.platform} ${s.local}`).join(", ") })),
      });
      raw = parseAgentJson(await aiOrchestrator.executeTask("analysis", user, "openai", { systemPrompt: system }));
    } catch (e) {
      // The validator's deterministic, spread-out defaults cover for a failed or unusable AI answer.
      console.warn(`[CONTENT_PLAN] AI weekly plan unavailable for ${key}, using defaults:`, e instanceof Error ? e.message : e);
    }
    const planned = validateWeekPlan({ weekStart: cycle.week_start, timezone, platforms, count, raw, existing });
    next[key] = [...existing, ...planned].sort((a, b) => a.slot_index - b.slot_index);
    added[key] = planned.length;
  }

  if (added.social + added.linkedin > 0) {
    const { error: upErr } = await supabase.from("content_generation_cycles").update({ week_plan: next }).eq("id", cycleId);
    if (upErr) throw new Error(`planCycleWeek: could not save the plan: ${upErr.message}`);
  }
  return added;
}
