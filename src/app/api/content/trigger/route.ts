import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/services/inngest/client";

/**
 * Manual "Generate now", in either mode (trigger_manual_content_cycle decides by the current mode).
 *
 * Adds N social images and N social videos (each shared by TikTok/Instagram/Facebook — the user
 * picks the format, the AI follows it), N LinkedIn posts and N blog posts, then kicks the worker.
 * - Testing: into the UPCOMING week's Testing cycle; gallery only, never published (the database
 *   refuses any publishing record for Testing content).
 * - Live: into the CURRENT week's Live cycle; each creative gets an AI-chosen time in the next
 *   7 days and is then published like any Live content. Owners/admins only (checked in SQL).
 *
 * Runs on the signed-in user's session: the function checks the caller's role and that automation
 * is enabled, so no service role is used.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const count = (v: unknown, dflt: number) => {
      const n = v === undefined ? dflt : Number(v);
      return Number.isInteger(n) && n >= 0 && n <= 3 ? n : NaN;
    };
    const socialImage = count(body.socialImage, 0);
    const socialVideo = count(body.socialVideo, 0);
    const linkedin = count(body.linkedin, 0);
    const blog = count(body.blog, 0);
    if ([socialImage, socialVideo, linkedin, blog].some(Number.isNaN) || socialImage + socialVideo + linkedin + blog < 1) {
      return NextResponse.json({ error: "socialImage, socialVideo, linkedin and blog must each be 0–3, and at least one must be 1+" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: cycleId, error } = await supabase.rpc("trigger_manual_content_cycle", { p_social_image: socialImage, p_social_video: socialVideo, p_linkedin: linkedin, p_blog: blog });
    if (error) {
      const status = error.code === "42501" ? 403 : 409;
      return NextResponse.json({ error: error.message }, { status });
    }

    await inngest.send({ name: "content/process-queue", data: { cycleId } });
    return NextResponse.json({ success: true, cycleId, queued: { socialImage, socialVideo, linkedin, blog } });
  } catch (error: unknown) {
    console.error("[CONTENT_TRIGGER]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to start generation" }, { status: 500 });
  }
}
