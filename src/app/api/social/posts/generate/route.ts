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
    if (body.format !== "image") {
      return NextResponse.json({ error: "format must be 'image' — AI video generation is handled by content automation" }, { status: 400 });
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
      name: "social/generate-image",
      data: {
        businessId: business.id,
        ideaPrompt: body.ideaPrompt,
        aspectRatio: body.aspectRatio,
        platforms,
        socialPostIds,
      },
    });

    return NextResponse.json({
      success: true,
      socialPostIds,
      message: platforms.length
        ? "Image generation started"
        : "Image generation started — it'll land in your Media Library",
    });
  } catch (error: any) {
    console.error("[SOCIAL_POSTS_GENERATE]", error);
    return NextResponse.json({ error: "Failed to start content generation" }, { status: 500 });
  }
}
