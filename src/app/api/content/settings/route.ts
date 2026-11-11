import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";
import type { AutomationSettings } from "@/modules/content/types/content.types";

type SettingsUpdate = Database["public"]["Tables"]["content_automation_settings"]["Update"];

type Row = { social_frequency_per_week: number; linkedin_frequency_per_week: number; blog_frequency_per_week: number; automation_mode: string; is_enabled: boolean; auto_run_enabled: boolean; generation_timezone: string };
const COLS = "social_frequency_per_week, linkedin_frequency_per_week, blog_frequency_per_week, automation_mode, is_enabled, auto_run_enabled, generation_timezone";

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
  socialFrequency: row.social_frequency_per_week, linkedinFrequency: row.linkedin_frequency_per_week, blogFrequency: row.blog_frequency_per_week,
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
 * Partial update. During the testing phase two things are deliberately refused
 * here (and not just hidden in the UI): selecting Live mode, and turning on
 * auto-run — generation only starts from the manual button. The database
 * additionally restricts mode / enabled / auto-run changes to owners and admins.
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { supabase, businessId, canAdmin, row } = await load();
    const update: SettingsUpdate = {};

    for (const [key, col] of [["socialFrequency", "social_frequency_per_week"], ["linkedinFrequency", "linkedin_frequency_per_week"], ["blogFrequency", "blog_frequency_per_week"]] as const) {
      if (body[key] !== undefined) {
        const n = Number(body[key]);
        if (!Number.isInteger(n) || n < 0 || n > 14) return NextResponse.json({ error: `${key} must be a whole number from 0 to 14` }, { status: 400 });
        update[col] = n;
      }
    }
    if (body.mode !== undefined) {
      if (body.mode !== "testing") return NextResponse.json({ error: "Live mode isn't available yet — publishing hasn't been built. Testing mode only." }, { status: 400 });
      update.automation_mode = "testing";
    }
    if (body.autoRunEnabled !== undefined) {
      if (body.autoRunEnabled !== false) return NextResponse.json({ error: "Automatic weekly runs are switched off during testing. Use Generate now." }, { status: 400 });
      update.auto_run_enabled = false;
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
    if (adminOnly && !canAdmin) return NextResponse.json({ error: "Only owners and admins can pause/resume automation" }, { status: 403 });

    const { error } = await supabase.from("content_automation_settings").update(update).eq("business_id", businessId);
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });
    const { row: fresh } = await load();
    return NextResponse.json({ settings: toBody(fresh, canAdmin) });
  } catch (error: unknown) {
    const status = (error as { status?: number }).status ?? 500;
    if (status === 500) console.error("[CONTENT_SETTINGS_PATCH]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save settings" }, { status });
  }
}
