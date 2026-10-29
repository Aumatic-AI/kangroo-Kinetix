import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { aiOrchestrator } from "@/services/ai/orchestrator";
import { getSocialIdeaPrompt } from "@/prompts/social-media";

export async function POST(request: Request) {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const body = await request.json();

    if (!body.ideaPrompt || !String(body.ideaPrompt).trim()) {
      return NextResponse.json({ error: "Missing required field: ideaPrompt" }, { status: 400 });
    }
    if (body.format !== "image" && body.format !== "video" && body.format !== "text") {
      return NextResponse.json({ error: "format must be 'image', 'video', or 'text'" }, { status: 400 });
    }

    const { data: business } = await supabase.from("businesses").select("*").limit(1).single();
    if (!business) throw new Error("No business found");

    const prompt = getSocialIdeaPrompt(business, {
      format: body.format,
      ideaPrompt: body.ideaPrompt,
      service: body.service,
    });

    const responseText = (await aiOrchestrator.executeTask("analysis", prompt.user, "openai", { systemPrompt: prompt.system })) as string;
    const jsonStr = responseText.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed.ideas) || parsed.ideas.length === 0) {
      throw new Error("AI response did not contain an ideas array");
    }

    return NextResponse.json({ success: true, ideas: parsed.ideas });
  } catch (error: any) {
    console.error("[SOCIAL_POSTS_GENERATE_IDEA]", error);
    return NextResponse.json({ error: "Failed to generate ideas" }, { status: 500 });
  }
}
