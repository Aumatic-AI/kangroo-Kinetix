import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/services/inngest/client";
import type { Database } from "@/types/supabase";
import type { AutomationSettings } from "@/modules/content/types/content.types";

type SettingsUpdate = Database["public"]["Tables"]["content_automation_settings"]["Update"];

type Row = { social_image_frequency_per_week: number; social_video_frequency_per_week: number; linkedin_frequency_per_week: number; blog_frequency_per_week: number; automation_mode: string; is_enabled: boolean; auto_run_enabled: boolean; generation_timezone: string };
const COLS = "social_image_frequency_per_week, social_video_frequency_per_week, linkedin_frequency_per_week, blog_frequency_per_week, automation_mode, is_enabled, auto_run_enabled, generation_timezone";

async function load(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; businessId: string; canAdmin: boolean; row: Row }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw Object.assign(new Error("Not authenticated"), { status: 401 });
  const { data: membership } = await supabase.from("business_users").select("business_id, role").eq("user_id", user.id).limit(1).maybeSingle();
  if (!membership) throw Object.assign(new Error("No business membership"), { status: 404 });

  let { data: row } = await supabase.from("content_automation_settings").select(COLS).eq("business_id", membership.business_id).maybeSingle();
  if (!row) {
    // Default row is the safe state: Testing, paused, no auto-run. The DB guard
    // lets any editor create exactly this and nothing more permissive.
    const { error } = await supabase.from("content_automation_settings").insert({ business_id: membership.business_id });
    if (error && error.code !== "23505") throw new Error(error.message);
    ({ data: row } = await supabase.from("content_automation_settings").select(COLS).eq("business_id", membership.business_id).single());
  }
  return { supabase, businessId: membership.business_id, canAdmin: ["owner", "admin"].includes(membership.role), row: row as Row };
}

const toBody = (row: Row, canAdmin: boolean): AutomationSettings => ({
  socialImageFrequency: row.social_image_frequency_per_week, socialVideoFrequency: row.social_video_frequency_per_week, linkedinFrequency: row.linkedin_frequency_per_week, blogFrequency: row.blog_frequency_per_week,
  mode: row.automation_mode as "testing" | "live", isEnabled: row.is_enabled, autoRunEnabled: row.auto_run_enabled,
  timezone: row.generation_timezone, canAdmin,
});

export async function GET() {
  try {
    const { row, canAdmin } = await load();
    return NextResponse.json({ settings: toBody(row, canAdmin) });
  } catch (error: unknown) {
    const status = (error as { status?: number }).status ?? 500;
    if (status === 500) console.error("[CONTENT_SETTINGS_GET]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load settings" }, { status });
  }
}

/**
 * Partial update. Mode (testing/live), pause/resume and automatic weekly runs are
 * owner/admin only — checked here and again by the database guard. Going Live
 * means the Friday run's content is PUBLISHED: social/LinkedIn posts and WordPress
 * blogs, each at its AI-proposed time. Leaving Live (or
 * pausing) holds anything not yet published; going Live again releases it.
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { supabase, businessId, canAdmin, row } = await load();
    const update: SettingsUpdate = {};

    for (const [key, col] of [["socialImageFrequency", "social_image_frequency_per_week"], ["socialVideoFrequency", "social_video_frequency_per_week"], ["linkedinFrequency", "linkedin_frequency_per_week"], ["blogFrequency", "blog_frequency_per_week"]] as const) {
      if (body[key] !== undefined) {
        const n = Number(body[key]);
        if (!Number.isInteger(n) || n < 0 || n > 14) return NextResponse.json({ error: `${key} must be a whole number from 0 to 14` }, { status: 400 });
        update[col] = n;
      }
    }
    // Images and videos share the social pipeline's 14-per-week cap.
    const socialTotal = (update.social_image_frequency_per_week ?? row.social_image_frequency_per_week) + (update.social_video_frequency_per_week ?? row.social_video_frequency_per_week);
    if (socialTotal > 14) return NextResponse.json({ error: "Social images and videos together can't be more than 14 per week" }, { status: 400 });
    if (body.mode !== undefined) {
      if (body.mode !== "testing" && body.mode !== "live") return NextResponse.json({ error: "mode must be \"testing\" or \"live\"" }, { status: 400 });
      update.automation_mode = body.mode;
    }
    if (body.autoRunEnabled !== undefined) {
      if (typeof body.autoRunEnabled !== "boolean") return NextResponse.json({ error: "autoRunEnabled must be true or false" }, { status: 400 });
      update.auto_run_enabled = body.autoRunEnabled;
    }
    if (body.isEnabled !== undefined) {
      if (typeof body.isEnabled !== "boolean") return NextResponse.json({ error: "isEnabled must be true or false" }, { status: 400 });
      update.is_enabled = body.isEnabled;
    }
    if (!Object.keys(update).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    const adminOnly =
      (update.automation_mode !== undefined && update.automation_mode !== row.automation_mode) ||
      (update.is_enabled !== undefined && update.is_enabled !== row.is_enabled) ||
      (update.auto_run_enabled !== undefined && update.auto_run_enabled !== row.auto_run_enabled);
    if (adminOnly && !canAdmin) return NextResponse.json({ error: "Only owners and admins can change the mode, pause/resume or automatic runs" }, { status: 403 });

    const { error } = await supabase.from("content_automation_settings").update(update).eq("business_id", businessId);
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });
    const { row: fresh } = await load();
    // Going Live (or resuming while Live): the settings trigger released held posts and blog
    // publications (revalidated; anything no longer publishable is skipped). Hand them to the
    // publishers — each social post timed for its own slot. The 15-minute sweep is the backstop.
    const wasLive = row.automation_mode === "live" && row.is_enabled;
    if (!wasLive && fresh.automation_mode === "live" && fresh.is_enabled) {
      const [{ data: pending }, { data: scheduled }] = await Promise.all([
        supabase.from("blog_publications").select("id").eq("business_id", businessId).eq("status", "pending"),
        supabase.from("social_posts").select("id, scheduled_at").eq("business_id", businessId).not("property_content_id", "is", null).eq("status", "scheduled"),
      ]);
      const events = [
        ...(pending ?? []).map((p) => ({ name: "content/blog-publish", data: { publicationId: p.id } })),
        ...(scheduled ?? []).map((p) => ({ name: "content/publish-post", data: { postId: p.id }, ts: Math.max(Date.now(), Date.parse(p.scheduled_at as string)) })),
      ];
      if (events.length) await inngest.send(events);
    }
    return NextResponse.json({ settings: toBody(fresh, canAdmin) });
  } catch (error: unknown) {
    const status = (error as { status?: number }).status ?? 500;
    if (status === 500) console.error("[CONTENT_SETTINGS_PATCH]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save settings" }, { status });
  }
}
