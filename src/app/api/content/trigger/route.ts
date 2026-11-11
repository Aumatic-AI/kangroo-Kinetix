import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/services/inngest/client";

/**
 * TEMPORARY manual "Generate now" for the testing phase.
 *
 * Adds N social creatives (shared by TikTok/Instagram/Facebook), N LinkedIn
 * posts and N blog posts to the upcoming week's Testing cycle, then kicks the generation worker.
 * It GENERATES INTO THE GALLERY ONLY — nothing is published to any account:
 * the database function refuses anything but Testing mode, and no code path
 * here (or in the worker) creates a publishing record.
 *
 * Runs on the signed-in user's session: trigger_manual_content_cycle checks the
 * caller is editor+ and that automation is enabled, so no service role is used.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const count = (v: unknown, dflt: number) => {
      const n = v === undefined ? dflt : Number(v);
      return Number.isInteger(n) && n >= 0 && n <= 3 ? n : NaN;
    };
    const social = count(body.social, 1);
    const linkedin = count(body.linkedin, 1);
    const blog = count(body.blog, 0);
    if (Number.isNaN(social) || Number.isNaN(linkedin) || Number.isNaN(blog) || social + linkedin + blog < 1) {
      return NextResponse.json({ error: "social, linkedin and blog must each be 0–3, and at least one must be 1+" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: cycleId, error } = await supabase.rpc("trigger_manual_content_cycle", { p_social: social, p_linkedin: linkedin, p_blog: blog });
    if (error) {
      const status = error.code === "42501" ? 403 : 409;
      return NextResponse.json({ error: error.message }, { status });
    }

    await inngest.send({ name: "content/process-queue", data: { cycleId } });
    return NextResponse.json({ success: true, cycleId, queued: { social, linkedin, blog } });
  } catch (error: unknown) {
    console.error("[CONTENT_TRIGGER]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to start generation" }, { status: 500 });
  }
}
