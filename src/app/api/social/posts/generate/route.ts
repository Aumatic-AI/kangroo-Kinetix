import { NextResponse } from "next/server";
import { inngest } from "@/services/inngest/client";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { SUPPORTED_UPLOAD_POST_PLATFORMS } from "@/services/upload-post";

const VALID_PLATFORMS: string[] = SUPPORTED_UPLOAD_POST_PLATFORMS;

export async function POST(request: Request) {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const body = await request.json();

    if (!body.ideaPrompt || !String(body.ideaPrompt).trim()) {
      return NextResponse.json({ error: "Missing required field: ideaPrompt" }, { status: 400 });
    }
    if (body.format !== "image" && body.format !== "video") {
      return NextResponse.json({ error: "format must be 'image' or 'video'" }, { status: 400 });
    }
    if (body.format === "video" && body.audioStyle === "Voiceover" && !body.voiceId) {
      return NextResponse.json({ error: "voiceId is required when Audio Style is Voiceover" }, { status: 400 });
    }

    // Platforms are optional — content can be generated purely to sit in
    // the Media Library, with nowhere to post it selected yet.
    const platforms: string[] = Array.isArray(body.platforms) ? body.platforms : [];
    const invalid = platforms.filter((p) => !VALID_PLATFORMS.includes(p));
    if (invalid.length) {
      return NextResponse.json({ error: `Unknown platform(s): ${invalid.join(", ")}` }, { status: 400 });
    }

    const { data: business } = await supabase.from("businesses").select("id").limit(1).single();
    if (!business) throw new Error("No business found");

    let connections: { id: string; platform: string }[] = [];
    if (platforms.length) {
      const { data } = await supabase
        .from("platform_connections")
        .select("id, platform")
        .eq("business_id", business.id)
        .eq("account_kind", "upload_post")
        .eq("status", "connected")
        .in("platform", platforms as Database["public"]["Enums"]["platform_type"][]);
      connections = data || [];

      const connectedPlatforms = new Set(connections.map((c) => c.platform as string));
      const notConnected = platforms.filter((p) => !connectedPlatforms.has(p));
      if (notConnected.length) {
        return NextResponse.json({ error: `Not connected yet: ${notConnected.join(", ")}. Connect them first in Connected Accounts.` }, { status: 400 });
      }
    }

    const generationInputs = {
      ideaPrompt: body.ideaPrompt,
      format: body.format,
      aspectRatio: body.aspectRatio,
      duration: body.duration,
      character: body.character,
      voiceId: body.voiceId,
      service: body.service,
      language: body.language,
      videoStyle: body.videoStyle,
      videoMode: body.videoMode,
      audioStyle: body.audioStyle,
      useReferencePhoto: body.useReferencePhoto,
    };

    // Always create at least one tracking row so generation progress and
    // the finished result show up in the Posts page — even with no
    // platform selected, in which case connection_id is left null and the
    // content is just saved to the Media Library.
    const rows: Database["public"]["Tables"]["social_posts"]["Insert"][] = platforms.length
      ? platforms.map((platform) => ({
          business_id: business.id,
          connection_id: connections.find((c) => (c.platform as string) === platform)!.id as string | null,
          status: "generating",
          format: body.format,
          idea_prompt: body.ideaPrompt,
          generation_inputs: generationInputs,
        }))
      : [{
          business_id: business.id,
          connection_id: null,
          status: "generating",
          format: body.format,
          idea_prompt: body.ideaPrompt,
          generation_inputs: generationInputs,
        }];

    const { data: createdPosts, error } = await supabase.from("social_posts").insert(rows).select("id");
    if (error || !createdPosts) throw new Error(error?.message || "Failed to create post records");
    const socialPostIds: string[] = createdPosts.map((p) => p.id);

    await inngest.send({
      name: body.format === "video" ? "social/generate-video" : "social/generate-image",
      data: {
        businessId: business.id,
        ideaPrompt: body.ideaPrompt,
        aspectRatio: body.aspectRatio,
        platforms,
        socialPostIds,
        duration: body.duration || 30,
        character: body.character || "male",
        voiceId: body.voiceId,
        service: body.service,
        language: body.language,
        videoStyle: body.videoStyle,
        videoMode: body.videoMode,
        audioStyle: body.audioStyle,
        useReferencePhoto: !!body.useReferencePhoto,
        // If the user already reviewed/edited a script in the modal, the
        // background job skips generating its own and uses this one
        // directly — see generate-social-video.ts step 2.
        script: body.format === "video" ? body.script || undefined : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      socialPostIds,
      message: platforms.length
        ? `${body.format === "video" ? "Video" : "Image"} generation started`
        : `${body.format === "video" ? "Video" : "Image"} generation started — it'll land in your Media Library`,
    });
  } catch (error: any) {
    console.error("[SOCIAL_POSTS_GENERATE]", error);
    return NextResponse.json({ error: "Failed to start content generation" }, { status: 500 });
  }
}
