import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const body = await request.json().catch(() => ({}));

    const { data: session } = await supabase.from("studio_sessions").select("*").eq("id", id).single();
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (!session.creative_id) {
      return NextResponse.json({ error: "This session doesn't have a generated image yet" }, { status: 400 });
    }
    if (!body.imageUrl) {
      return NextResponse.json({ error: "Missing required field: imageUrl" }, { status: 400 });
    }

    // Finalizing an image just makes it the one shown in Ad Library — the
    // session itself is never locked, so chatting/editing (which continues
    // from raw_image_url) stays available for any image, before or after.
    await supabase.from("meta_ad_creatives").update({ status: "approved", media_urls: [body.imageUrl] }).eq("id", session.creative_id);
    await supabase.from("studio_sessions").update({ raw_image_url: body.imageUrl }).eq("id", id);

    return NextResponse.json({ success: true, creativeId: session.creative_id });
  } catch (error) {
    console.error("[STUDIO_FINALIZE]", error);
    return NextResponse.json({ error: "Failed to finalize the ad" }, { status: 500 });
  }
}
