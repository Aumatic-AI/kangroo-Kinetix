import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ActivityResponse, ContentType, GenerationStatus } from "@/modules/content/types/content.types";

/** Generation activity: the latest cycles and their jobs (including ones that
 * haven't produced a creative yet or have failed), so a click on "Generate now"
 * is visible immediately and failures are never silent. */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: cycles, error } = await supabase.from("content_generation_cycles")
      .select("id, week_start, week_end, status, social_target_count, linkedin_target_count, blog_target_count")
      .order("week_start", { ascending: false }).limit(3);
    if (error) throw new Error(error.message);

    const cycleIds = (cycles ?? []).map((c) => c.id);
    const { data: jobs, error: jobErr } = cycleIds.length
      ? await supabase.from("content_generation_queue")
          .select("id, pipeline_type, generation_status, generation_attempts, max_attempts, error_message, property_id, content_type, created_at")
          .in("cycle_id", cycleIds).order("created_at", { ascending: false }).limit(60)
      : { data: [], error: null };
    if (jobErr) throw new Error(jobErr.message);

    const propIds = [...new Set((jobs ?? []).map((j) => j.property_id).filter((p): p is string => !!p))];
    const { data: props } = propIds.length ? await supabase.from("properties").select("id, title").in("id", propIds) : { data: [] };
    const titles = new Map((props ?? []).map((p) => [p.id, p.title]));

    const body: ActivityResponse = {
      cycles: (cycles ?? []).map((c) => ({ id: c.id, weekStart: c.week_start, weekEnd: c.week_end ?? c.week_start, status: c.status, socialTarget: c.social_target_count, linkedinTarget: c.linkedin_target_count, blogTarget: c.blog_target_count })),
      jobs: (jobs ?? []).map((j) => ({
        id: j.id, pipeline: j.pipeline_type as "social" | "linkedin" | "blog", status: j.generation_status as GenerationStatus, attempts: j.generation_attempts,
        maxAttempts: j.max_attempts, error: j.error_message, propertyTitle: j.property_id ? titles.get(j.property_id) ?? null : null,
        contentType: (j.content_type as ContentType | null) ?? null, createdAt: j.created_at,
      })),
    };
    return NextResponse.json(body);
  } catch (error: unknown) {
    console.error("[CONTENT_ACTIVITY]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load activity" }, { status: 500 });
  }
}
