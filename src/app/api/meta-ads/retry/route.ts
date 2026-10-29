import { NextResponse } from "next/server";
import { inngest } from "@/services/inngest/client";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

export async function POST(request: Request) {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
    }

    const { data: creative } = await supabase
      .from("meta_ad_creatives")
      .select("*")
      .eq("id", body.id)
      .single();

    if (!creative) throw new Error("Creative not found");
    if (creative.status !== "failed") {
      return NextResponse.json({ error: "Only failed creatives can be retried" }, { status: 400 });
    }

    await supabase
      .from("meta_ad_creatives")
      .update({ status: "pending", ad_script: null, media_urls: null })
      .eq("id", creative.id);

    if (creative.type === "video") {
      await inngest.send({
        name: "meta-ads/generate-video",
        data: {
          duration: creative.duration,
          audioStyle: creative.audio_style,
          character: creative.character_type,
          voiceId: creative.voice_id,
          videoStyle: creative.video_style,
          language: creative.language,
          ideaPrompt: creative.idea_prompt,
          service: creative.service,
          creativeId: creative.id,
          businessId: creative.business_id,
        },
      });
    } else {
      await inngest.send({
        name: "meta-ads/generate-image",
        data: {
          ideaPrompt: creative.idea_prompt,
          service: creative.service,
          creativeId: creative.id,
          businessId: creative.business_id,
        },
      });
    }

    return NextResponse.json({ success: true, message: "Retry started" });
  } catch (error: any) {
    console.error("[META_ADS_RETRY]", error);
    return NextResponse.json({ error: "Failed to retry generation" }, { status: 500 });
  }
}
