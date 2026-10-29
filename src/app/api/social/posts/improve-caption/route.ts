import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { aiOrchestrator } from "@/services/ai/orchestrator";
import { getImproveCaptionPrompt, SocialPlatform } from "@/prompts/social-media";
import { SUPPORTED_UPLOAD_POST_PLATFORMS } from "@/services/upload-post";

/** Rewrites one already-written caption on request, from the Publish
 * flow's editable preview — a targeted rewrite, not a fresh generation. */
export async function POST(request: Request) {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const body = await request.json();

    if (!body.caption || !String(body.caption).trim()) {
      return NextResponse.json({ error: "Missing required field: caption" }, { status: 400 });
    }
    if (!SUPPORTED_UPLOAD_POST_PLATFORMS.includes(body.platform)) {
      return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
    }

    const { data: business } = await supabase.from("businesses").select("*").limit(1).single();
    if (!business) throw new Error("No business found");

    const prompt = getImproveCaptionPrompt(business, {
      platform: body.platform as SocialPlatform,
      caption: body.caption,
      instruction: body.instruction,
    });

    const caption = ((await aiOrchestrator.executeTask("analysis", prompt.user, "openai", { systemPrompt: prompt.system })) as string).trim();

    return NextResponse.json({ success: true, caption });
  } catch (error: any) {
    console.error("[SOCIAL_POSTS_IMPROVE_CAPTION]", error);
    return NextResponse.json({ error: "Failed to improve caption" }, { status: 500 });
  }
}
