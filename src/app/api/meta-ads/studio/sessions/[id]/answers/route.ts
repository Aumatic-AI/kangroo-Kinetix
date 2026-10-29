import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { inngest } from "@/services/inngest/client";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const body = await request.json();

    if (!Array.isArray(body.answers)) {
      return NextResponse.json({ error: "Missing required field: answers" }, { status: 400 });
    }

    const { data: session } = await supabase.from("studio_sessions").select("*").eq("id", id).single();
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    // Answers are rendered inline in the original questions message (via
    // session.qa_brief) once submitted — no separate chat bubble for them.
    const creativeId = crypto.randomUUID();
    try {
      await inngest.send({
        name: "meta-ads/generate-studio-image",
        data: {
          sessionId: id,
          businessId: session.business_id,
          creativeId,
          service: session.service,
          initialIdea: session.initial_idea,
          qaBrief: body.answers,
          referenceImageUrl: session.reference_image_url,
          aspectRatio: session.aspect_ratio,
        },
      });
    } catch (sendError) {
      console.error("[STUDIO_ANSWERS] Inngest unreachable", sendError);
      return NextResponse.json(
        { error: "Background job queue is not reachable — make sure the Inngest dev server is running." },
        { status: 503 }
      );
    }

    await supabase.from("meta_ad_creatives").insert({
      id: creativeId,
      business_id: session.business_id,
      type: "image",
      idea_prompt: session.initial_idea,
      service: session.service,
      status: "pending",
      studio_session_id: id,
    });

    const { data: updatedSession } = await supabase
      .from("studio_sessions")
      .update({ qa_brief: body.answers, status: "generating", creative_id: creativeId })
      .eq("id", id)
      .select()
      .single();

    return NextResponse.json({ success: true, session: updatedSession });
  } catch (error) {
    console.error("[STUDIO_ANSWERS]", error);
    return NextResponse.json({ error: "Failed to submit answers" }, { status: 500 });
  }
}
