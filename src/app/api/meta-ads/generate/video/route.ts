import { NextResponse } from "next/server";
import { inngest } from "@/services/inngest/client";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

export async function POST(request: Request) {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const body = await request.json();
    
    // Validate required fields
    if (!body.ideaPrompt) {
      return NextResponse.json(
        { error: "Missing required field: ideaPrompt" },
        { status: 400 }
      );
    }
    if (!body.service) {
      return NextResponse.json(
        { error: "Missing required field: service" },
        { status: 400 }
      );
    }

    const { data: business } = await supabase.from("businesses").select("id").limit(1).single();
    if (!business) throw new Error("No business found");

    // Confirm the background job queue can actually accept this job BEFORE
    // creating any DB record — otherwise a down Inngest server (e.g. the
    // local dev server not started) leaves an orphaned "pending" creative
    // that will never complete, with no visible error either.
    const creativeId = crypto.randomUUID();
    try {
      await inngest.send({
        name: "meta-ads/generate-video",
        data: {
          duration: body.duration,
          audioStyle: body.audioStyle,
          character: body.character,
          voiceId: body.voiceId,
          videoStyle: body.videoStyle,
          videoMode: body.videoMode || "live_action",
          useReferencePhoto: !!body.useReferencePhoto,
          language: body.language,
          aspectRatio: body.aspectRatio === "16:9" ? "16:9" : "9:16",
          ideaPrompt: body.ideaPrompt,
          service: body.service,
          creativeId,
          businessId: business.id,
          // If the user already reviewed/edited a script in the modal, the
          // background job skips generating its own and uses this one
          // directly — see generate-video-ad.ts step 2.
          script: body.script || undefined,
        }
      });
    } catch (sendError) {
      console.error("[META_ADS_GENERATE_VIDEO] Inngest unreachable", sendError);
      return NextResponse.json(
        { error: "Background job queue is not reachable — make sure the Inngest dev server is running." },
        { status: 503 }
      );
    }

    // Job accepted — now create the DB record it will update.
    const { data: creative, error } = await supabase
      .from('meta_ad_creatives')
      .insert({
        id: creativeId,
        business_id: business.id,
        type: 'video',
        idea_prompt: body.ideaPrompt,
        service: body.service,
        duration: body.duration,
        video_style: body.videoStyle,
        video_mode: body.videoMode || "live_action",
        aspect_ratio: body.aspectRatio === "16:9" ? "16:9" : "9:16",
        audio_style: body.audioStyle,
        character_type: body.character,
        language: body.language,
        status: 'pending',
      })
      .select()
      .single();

    if (error || !creative) throw new Error("Failed to create record");

    return NextResponse.json({ success: true, data: creative, message: "Video generation started" });
  } catch (error: any) {
    console.error("[META_ADS_GENERATE_VIDEO]", error);
    return NextResponse.json(
      { error: "Failed to start video generation" },
      { status: 500 }
    );
  }
}
