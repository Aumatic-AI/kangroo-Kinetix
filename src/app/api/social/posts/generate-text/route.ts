import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { aiOrchestrator } from "@/services/ai/orchestrator";
import { getSocialCaptionPrompt, formatPlatformCaptions, SocialPlatform } from "@/prompts/social-media";
import { PLATFORMS } from "@/modules/social/lib/platforms";

const TEXT_ONLY_PLATFORMS = new Set(PLATFORMS.filter((p) => p.supportsTextOnly).map((p) => p.platform));

/**
 * Generates a text-only post (no media) directly — no Kie/FFmpeg wait, so
 * this runs synchronously, same as the direct-upload path. Platforms are
 * chosen up front here (unlike image/video, which pick platforms *after*
 * generation) because a text post has nothing to preview or reuse without
 * knowing which platforms it's for — the caller redirects straight to the
 * Publish flow's preview step with the resulting socialPostIds.
 */
export async function POST(request: Request) {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const body = await request.json();

    const ideaPrompt: string = body.ideaPrompt;
    const platforms: string[] = Array.isArray(body.platforms) ? body.platforms : [];

    if (!ideaPrompt || !ideaPrompt.trim()) {
      return NextResponse.json({ error: "Missing required field: ideaPrompt" }, { status: 400 });
    }
    if (!platforms.length) {
      return NextResponse.json({ error: "Select at least one platform" }, { status: 400 });
    }
    const unsupported = platforms.filter((p) => !TEXT_ONLY_PLATFORMS.has(p as any));
    if (unsupported.length) {
      return NextResponse.json({ error: `These platforms don't support text-only posts: ${unsupported.join(", ")}` }, { status: 400 });
    }

    const { data: business } = await supabase.from("businesses").select("*").limit(1).single();
    if (!business) throw new Error("No business found");

    const { data: connections } = await supabase
      .from("platform_connections")
      .select("id, platform")
      .eq("business_id", business.id)
      .eq("account_kind", "upload_post")
      .eq("status", "connected")
      .in("platform", platforms as Database["public"]["Enums"]["platform_type"][]);

    const notConnected = platforms.filter((p) => !(connections || []).some((c) => (c.platform as string) === p));
    if (notConnected.length) {
      return NextResponse.json({ error: `Not connected yet: ${notConnected.join(", ")}. Connect them first in Connected Accounts.` }, { status: 400 });
    }

    const prompt = getSocialCaptionPrompt(business, { ideaPrompt, contentType: "text" });
    const responseText = (await aiOrchestrator.executeTask("analysis", prompt.user, "openai", { systemPrompt: prompt.system })) as string;
    const jsonStr = responseText.replace(/```json\n?|\n?```/g, "").trim();
    const captionMeta = JSON.parse(jsonStr);
    const platformCaptions = formatPlatformCaptions(captionMeta, platforms as SocialPlatform[]);

    const rows: Database["public"]["Tables"]["social_posts"]["Insert"][] = platforms.map((platform) => ({
      business_id: business.id,
      connection_id: (connections || []).find((c) => (c.platform as string) === platform)!.id,
      status: "draft",
      format: "text",
      idea_prompt: ideaPrompt,
      media_asset_id: null,
      caption: platformCaptions[platform as SocialPlatform]?.text || "",
      title: platformCaptions[platform as SocialPlatform]?.title || null,
      generation_inputs: { ideaPrompt, captionMeta },
    }));

    const { data: createdPosts, error } = await supabase.from("social_posts").insert(rows).select("id");
    if (error || !createdPosts) throw new Error(error?.message || "Failed to create post records");

    return NextResponse.json({ success: true, socialPostIds: createdPosts.map((p) => p.id) });
  } catch (error: any) {
    console.error("[SOCIAL_POSTS_GENERATE_TEXT]", error);
    return NextResponse.json({ error: error.message || "Failed to generate text post" }, { status: 500 });
  }
}
