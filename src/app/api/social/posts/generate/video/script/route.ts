import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { generateSocialVideoScript } from "@/services/ai/social-video-script";

/**
 * Generates just the voiceover script for a social video post — the same
 * prompt and AI call the background generation job itself uses (see
 * src/services/ai/social-video-script.ts), run synchronously here so
 * CreatePostModal can show it for review/editing before anything slower
 * (visual prompts, images, video clips, stitching) is kicked off. No
 * `social_posts` row is created here — that only happens once the user
 * confirms (POST /api/social/posts/generate with the approved script
 * attached), so closing the modal at this point leaves nothing behind.
 */
export async function POST(request: Request) {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const body = await request.json();

    if (!body.ideaPrompt || !String(body.ideaPrompt).trim()) {
      return NextResponse.json({ error: "Missing required field: ideaPrompt" }, { status: 400 });
    }

    const { data: business } = await supabase.from("businesses").select("*").limit(1).single();
    if (!business) throw new Error("No business found");

    const script = await generateSocialVideoScript(business, {
      ideaPrompt: body.ideaPrompt,
      duration: body.duration || 30,
      character: body.character || "male",
      service: body.service,
      language: body.language,
    });

    return NextResponse.json({ success: true, script });
  } catch (error) {
    console.error("[SOCIAL_POSTS_GENERATE_VIDEO_SCRIPT]", error);
    return NextResponse.json({ error: "Failed to generate the script" }, { status: 500 });
  }
}
