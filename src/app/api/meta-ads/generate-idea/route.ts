import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { aiOrchestrator } from "@/services/ai/orchestrator";
import { generateIdeaPrompt } from "@/prompts/idea-generation";

export async function POST(request: Request) {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const body = await request.json();

    if (!body.idea || !String(body.idea).trim()) {
      return NextResponse.json({ error: "Missing required field: idea" }, { status: 400 });
    }
    if (body.type !== "video" && body.type !== "image") {
      return NextResponse.json({ error: "type must be 'video' or 'image'" }, { status: 400 });
    }

    const { data: business } = await supabase.from("businesses").select("*").limit(1).single();
    if (!business) throw new Error("No business found");

    const prompt = generateIdeaPrompt({
      businessName: business.name,
      industry: business.industry,
      coreOfferings: business.core_offerings,
      businessVoice: business.business_voice,
      targetAudience: business.target_audience,
      painPoints: business.pain_points,
      type: body.type,
      duration: body.duration,
      audioStyle: body.audioStyle,
      videoStyle: body.videoStyle,
      character: body.character,
      idea: body.idea,
      service: body.service,
    });

    const responseText = (await aiOrchestrator.executeTask("analysis", prompt.user, "openai", {
      systemPrompt: prompt.system,
    })) as string;

    const jsonStr = responseText.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed.ideas) || parsed.ideas.length === 0) {
      throw new Error("AI response did not contain an ideas array");
    }

    return NextResponse.json({ success: true, ideas: parsed.ideas });
  } catch (error: any) {
    console.error("[META_ADS_GENERATE_IDEA]", error);
    return NextResponse.json({ error: "Failed to generate ideas" }, { status: 500 });
  }
}
