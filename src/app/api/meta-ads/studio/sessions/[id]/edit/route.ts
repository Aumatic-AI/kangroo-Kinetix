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

    if (!body.instruction) {
      return NextResponse.json({ error: "Missing required field: instruction" }, { status: 400 });
    }

    const { data: session } = await supabase.from("studio_sessions").select("*").eq("id", id).single();
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (!session.raw_image_url || !session.creative_id) {
      return NextResponse.json({ error: "This session doesn't have a generated image yet" }, { status: 400 });
    }

    await supabase.from("studio_messages").insert({
      session_id: id,
      role: "user",
      kind: "text",
      content: body.instruction,
    });

    try {
      await inngest.send({
        name: "meta-ads/edit-studio-image",
        data: {
          sessionId: id,
          businessId: session.business_id,
          creativeId: session.creative_id,
          rawImageUrl: session.raw_image_url,
          aspectRatio: session.aspect_ratio,
          editInstruction: body.instruction,
        },
      });
    } catch (sendError) {
      console.error("[STUDIO_EDIT] Inngest unreachable", sendError);
      return NextResponse.json(
        { error: "Background job queue is not reachable — make sure the Inngest dev server is running." },
        { status: 503 }
      );
    }

    const { data: updatedSession } = await supabase
      .from("studio_sessions")
      .update({ status: "generating" })
      .eq("id", id)
      .select()
      .single();

    return NextResponse.json({ success: true, session: updatedSession });
  } catch (error) {
    console.error("[STUDIO_EDIT]", error);
    return NextResponse.json({ error: "Failed to submit the edit" }, { status: 500 });
  }
}
