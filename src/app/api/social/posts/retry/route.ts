import { NextResponse } from "next/server";
import { inngest } from "@/services/inngest/client";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

export async function POST(request: Request) {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const body = await request.json();

    if (!Array.isArray(body.socialPostIds) || !body.socialPostIds.length) {
      return NextResponse.json({ error: "Missing required field: socialPostIds" }, { status: 400 });
    }

    const { data: posts } = await supabase
      .from("social_posts")
      .select("id, business_id, format, status, generation_inputs, connection_id, platform_connections(platform)")
      .in("id", body.socialPostIds);

    if (!posts || !posts.length) throw new Error("Posts not found");
    if (posts.some((p) => p.status !== "failed")) {
      return NextResponse.json({ error: "Only failed posts can be retried" }, { status: 400 });
    }

    // Text posts are generated synchronously — a "failed" row only ever
    // means the *publish* attempt failed, never generation, so there's
    // nothing to regenerate. Just clear it back to draft so it can be
    // published again from the Posts grid.
    if (posts[0].format === "text") {
      await supabase.from("social_posts").update({ status: "draft", error_message: null }).in("id", body.socialPostIds);
      return NextResponse.json({ success: true, message: "Ready to publish again" });
    }

    const inputs: any = posts[0].generation_inputs || {};
    if (!inputs.ideaPrompt) {
      return NextResponse.json({ error: "This post has no stored generation inputs to retry from." }, { status: 400 });
    }

    await supabase
      .from("social_posts")
      .update({ status: "generating", error_message: null, media_asset_id: null })
      .in("id", body.socialPostIds);

    const platforms = posts.map((p: any) => p.platform_connections?.platform).filter(Boolean);

    await inngest.send({
      name: inputs.format === "video" ? "social/generate-video" : "social/generate-image",
      data: {
        businessId: posts[0].business_id,
        ideaPrompt: inputs.ideaPrompt,
        aspectRatio: inputs.aspectRatio,
        platforms,
        socialPostIds: body.socialPostIds,
        duration: inputs.duration || 30,
        character: inputs.character || "male",
        voiceId: inputs.voiceId,
        service: inputs.service,
        language: inputs.language,
        videoStyle: inputs.videoStyle,
        videoMode: inputs.videoMode,
        audioStyle: inputs.audioStyle,
        useReferencePhoto: !!inputs.useReferencePhoto,
      },
    });

    return NextResponse.json({ success: true, message: "Retry started" });
  } catch (error: any) {
    console.error("[SOCIAL_POSTS_RETRY]", error);
    return NextResponse.json({ error: error.message || "Failed to retry generation" }, { status: 500 });
  }
}
