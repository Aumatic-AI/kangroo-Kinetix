import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { aiOrchestrator } from "@/services/ai/orchestrator";
import { getSocialCaptionPrompt, formatPlatformCaptions, SocialPlatform } from "@/prompts/social-media";
import { SUPPORTED_UPLOAD_POST_PLATFORMS } from "@/services/upload-post";

const VALID_PLATFORMS: string[] = SUPPORTED_UPLOAD_POST_PLATFORMS;

/**
 * Called from the Posts grid's "Publish" flow when the user picks which
 * platforms to send an already-generated asset to. Reuses whatever
 * social_posts row already exists for a platform (e.g. it was picked back
 * at generation time); creates a fresh draft row — with a freshly
 * generated caption — for any newly-picked platform that doesn't have one
 * yet. Never publishes anything itself, just gets everything ready for the
 * preview step.
 */
export async function POST(request: Request) {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const body = await request.json();

    const mediaAssetId: string | undefined = body.mediaAssetId;
    const ideaPrompt: string | null = body.ideaPrompt || null;
    const format: "image" | "video" = body.format === "video" ? "video" : "image";
    const platforms: string[] = Array.isArray(body.platforms) ? body.platforms : [];

    if (!mediaAssetId) return NextResponse.json({ error: "Missing mediaAssetId" }, { status: 400 });
    if (!platforms.length) return NextResponse.json({ error: "Select at least one platform" }, { status: 400 });
    const invalid = platforms.filter((p) => !VALID_PLATFORMS.includes(p));
    if (invalid.length) return NextResponse.json({ error: `Unknown platform(s): ${invalid.join(", ")}` }, { status: 400 });

    const { data: business } = await supabase.from("businesses").select("*").limit(1).single();
    if (!business) throw new Error("No business found");

    const { data: existingRows } = await supabase
      .from("social_posts")
      .select("id, caption, title, platform_connections(platform, display_name, metadata)")
      .eq("media_asset_id", mediaAssetId);

    const existingByPlatform = new Map<string, any>();
    for (const row of existingRows || []) {
      const p = (row as any).platform_connections?.platform;
      if (p) existingByPlatform.set(p as string, row);
    }

    const newPlatforms = platforms.filter((p) => !existingByPlatform.has(p));

    let newConnections: { id: string; platform: string; display_name: string | null; metadata: any }[] = [];
    if (newPlatforms.length) {
      const { data } = await supabase
        .from("platform_connections")
        .select("id, platform, display_name, metadata")
        .eq("business_id", business.id)
        .eq("account_kind", "upload_post")
        .eq("status", "connected")
        .in("platform", newPlatforms as Database["public"]["Enums"]["platform_type"][]);
      newConnections = data || [];
      const notConnected = newPlatforms.filter((p) => !newConnections.some((c) => (c.platform as string) === p));
      if (notConnected.length) {
        return NextResponse.json({ error: `Not connected yet: ${notConnected.join(", ")}` }, { status: 400 });
      }
    }

    let platformCaptions: ReturnType<typeof formatPlatformCaptions> = {};
    if (newPlatforms.length) {
      const prompt = getSocialCaptionPrompt(business, { ideaPrompt: ideaPrompt || "A new update worth sharing", contentType: format });
      const responseText = (await aiOrchestrator.executeTask("analysis", prompt.user, "openai", { systemPrompt: prompt.system })) as string;
      const jsonStr = responseText.replace(/```json\n?|\n?```/g, "").trim();
      const captionMeta = JSON.parse(jsonStr);
      platformCaptions = formatPlatformCaptions(captionMeta, newPlatforms as SocialPlatform[]);
    }

    let createdRows: { id: string; connection_id: string | null }[] = [];
    if (newPlatforms.length) {
      const rows: Database["public"]["Tables"]["social_posts"]["Insert"][] = newPlatforms.map((platform) => ({
        business_id: business.id,
        connection_id: newConnections.find((c) => (c.platform as string) === platform)!.id,
        status: "draft",
        format,
        idea_prompt: ideaPrompt,
        media_asset_id: mediaAssetId,
        caption: platformCaptions[platform as SocialPlatform]?.text || "",
        title: platformCaptions[platform as SocialPlatform]?.title || null,
      }));
      const { data, error } = await supabase.from("social_posts").insert(rows).select("id, connection_id");
      if (error || !data) throw new Error(error?.message || "Failed to create post records");
      createdRows = data;
    }

    const result = platforms.map((platform) => {
      const existing = existingByPlatform.get(platform);
      if (existing) {
        return {
          id: existing.id,
          platform,
          caption: existing.caption || "",
          title: existing.title || undefined,
          account: {
            displayName: existing.platform_connections?.display_name || platform,
            avatarUrl: existing.platform_connections?.metadata?.avatarUrl,
          },
        };
      }
      const conn = newConnections.find((c) => (c.platform as string) === platform)!;
      const created = createdRows.find((r) => r.connection_id === conn.id)!;
      return {
        id: created.id,
        platform,
        caption: platformCaptions[platform as SocialPlatform]?.text || "",
        title: platformCaptions[platform as SocialPlatform]?.title || undefined,
        account: { displayName: conn.display_name || platform, avatarUrl: (conn.metadata as any)?.avatarUrl },
      };
    });

    return NextResponse.json({ success: true, rows: result });
  } catch (error: any) {
    console.error("[SOCIAL_POSTS_PREPARE_PLATFORMS]", error);
    return NextResponse.json({ error: error.message || "Failed to prepare platforms" }, { status: 500 });
  }
}
