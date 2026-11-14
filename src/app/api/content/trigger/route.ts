import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/services/inngest/client";

/**
 * TEMPORARY manual "Generate now" for the testing phase.
 *
 * Adds N social images and N social videos (each shared by TikTok/Instagram/Facebook — the user
 * picks the format, the AI follows it), N LinkedIn posts and N blog posts to the upcoming week's
 * Testing cycle, then kicks the generation worker.
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
