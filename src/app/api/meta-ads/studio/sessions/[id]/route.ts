import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = (await createClient()) as SupabaseClient<Database>;

    const { data: session, error } = await supabase.from("studio_sessions").select("*").eq("id", id).single();
    if (error || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const [{ data: messages }, { data: creative }] = await Promise.all([
      supabase.from("studio_messages").select("*").eq("session_id", id).order("created_at", { ascending: true }),
      session.creative_id
        ? supabase.from("meta_ad_creatives").select("media_urls, status").eq("id", session.creative_id).single()
        : Promise.resolve({ data: null }),
    ]);

    return NextResponse.json({ session, messages: messages || [], creative: creative || null });
  } catch (error) {
    console.error("[STUDIO_GET_SESSION]", error);
    return NextResponse.json({ error: "Failed to load session" }, { status: 500 });
  }
}
