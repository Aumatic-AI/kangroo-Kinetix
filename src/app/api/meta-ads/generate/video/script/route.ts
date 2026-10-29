import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { generateVideoScript } from "@/services/ai/video-script";

/**
 * Generates just the voiceover script for a video ad — the same prompt and
 * AI call the background generation job itself uses (see
 * src/services/ai/video-script.ts), just run synchronously here so the
 * Create Ad modal can show it for review/editing before anything slower
 * (visual prompts, images, video clips, stitching) is kicked off. No
 * `meta_ad_creatives` row is created at this point — that only happens once
 * the user confirms (POST /api/meta-ads/generate/video with the approved
 * script attached), so closing the modal here leaves nothing behind.
 */
export async function POST(request: Request) {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const body = await request.json();

    if (!body.ideaPrompt) {
      return NextResponse.json({ error: "Missing required field: ideaPrompt" }, { status: 400 });
    }
    if (!body.service) {
      return NextResponse.json({ error: "Missing required field: service" }, { status: 400 });
    }

    const { data: business } = await supabase.from("businesses").select("*").limit(1).single();
    if (!business) throw new Error("No business found");

    const intelligence = { business };

    const script = await generateVideoScript(intelligence, {
      ideaPrompt: body.ideaPrompt,
      duration: body.duration,
      audioStyle: body.audioStyle,
      videoStyle: body.videoStyle,
      character: body.character,
      service: body.service,
      language: body.language,
    });

    return NextResponse.json({ success: true, script });
  } catch (error) {
    console.error("[META_ADS_GENERATE_VIDEO_SCRIPT]", error);
    return NextResponse.json({ error: "Failed to generate the script" }, { status: 500 });
  }
}
