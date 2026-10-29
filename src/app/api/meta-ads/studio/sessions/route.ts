import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { aiOrchestrator } from "@/services/ai/orchestrator";
import { getAdBriefQuestionsPrompt } from "@/prompts/meta-ads/ad-studio/questions";

export async function POST(request: Request) {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const body = await request.json();

    if (!body.initialIdea) {
      return NextResponse.json({ error: "Missing required field: initialIdea" }, { status: 400 });
    }

    const { data: business } = await supabase.from("businesses").select("*").limit(1).single();
    if (!business) throw new Error("No business found");

    const aspectRatio = body.aspectRatio || "4:5";

    const { data: session, error: sessionError } = await supabase
      .from("studio_sessions")
      .insert({
        business_id: business.id,
        product_area: "meta_ads_image",
        service: body.service || null,
        initial_idea: body.initialIdea,
        aspect_ratio: aspectRatio,
        reference_image_url: body.referenceImageUrl || null,
      })
      .select()
      .single();

    if (sessionError || !session) throw new Error("Failed to create session");

    await supabase.from("studio_messages").insert({
      session_id: session.id,
      role: "user",
      kind: "text",
      content: body.initialIdea,
    });

    const prompt = getAdBriefQuestionsPrompt(business, {
      service: body.service,
      initialIdea: body.initialIdea,
      hasReferenceImage: !!body.referenceImageUrl,
    });

    const response = await aiOrchestrator.executeTask("text", prompt, "openai");
    const jsonStr = (response as string).replace(/```json\n?|\n?```/g, "").trim();
    const { questions } = JSON.parse(jsonStr);

    await supabase.from("studio_messages").insert({
      session_id: session.id,
      role: "assistant",
      kind: "questions",
      payload: { questions },
    });

    const { data: updatedSession } = await supabase
      .from("studio_sessions")
      .update({ status: "awaiting_answers" })
      .eq("id", session.id)
      .select()
      .single();

    return NextResponse.json({ success: true, session: updatedSession });
  } catch (error) {
    console.error("[STUDIO_CREATE_SESSION]", error);
    return NextResponse.json({ error: "Failed to start the ad studio session" }, { status: 500 });
  }
}
