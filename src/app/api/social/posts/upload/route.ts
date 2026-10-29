import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { aiOrchestrator } from "@/services/ai/orchestrator";
import { getSocialCaptionPrompt, formatPlatformCaptions, SocialPlatform } from "@/prompts/social-media";
import { SUPPORTED_UPLOAD_POST_PLATFORMS } from "@/services/upload-post";

const VALID_PLATFORMS: string[] = SUPPORTED_UPLOAD_POST_PLATFORMS;

/** Direct-upload path: user already has the media, so there's no Kie/FFmpeg
 * wait — this runs synchronously. Captions are still AI-generated (fast,
 * a single text call) unless the caller supplies its own. Platforms are
 * optional — the file can be saved straight to the Media Library with
 * nowhere to post it selected yet. */
export async function POST(request: Request) {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const formData = await request.formData();

    const file = formData.get("file") as File | null;
    const platformsRaw = formData.get("platforms");
    const captionIdea = (formData.get("captionIdea") as string | null) || "";
    const manualCaption = formData.get("caption") as string | null;

    if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });

    let platforms: string[] = [];
    if (platformsRaw) {
      try {
        platforms = JSON.parse(String(platformsRaw));
      } catch {
        return NextResponse.json({ error: "Invalid platforms list" }, { status: 400 });
      }
    }
    const invalid = platforms.filter((p) => !VALID_PLATFORMS.includes(p));
    if (invalid.length) return NextResponse.json({ error: `Unknown platform(s): ${invalid.join(", ")}` }, { status: 400 });

    const { data: business } = await supabase.from("businesses").select("*").limit(1).single();
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

    const isVideo = file.type.startsWith("video/");
    const buffer = await file.arrayBuffer();
    const fileName = `${business.id}/social/uploads/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "")}`;

    const { error: uploadError } = await supabase.storage.from("business_media").upload(fileName, buffer, { contentType: file.type });
    if (uploadError) throw new Error("Upload failed: " + uploadError.message);
    const { data: publicUrlData } = supabase.storage.from("business_media").getPublicUrl(fileName);

    const { data: asset, error: assetError } = await supabase
      .from("media_assets")
      .insert({
        business_id: business.id,
        type: isVideo ? "video" : "image",
        source: "uploaded",
        bucket: "business_media",
        storage_path: fileName,
        mime_type: file.type,
        size_bytes: buffer.byteLength,
        metadata: { publicUrl: publicUrlData.publicUrl },
      })
      .select()
      .single();
    if (assetError || !asset) throw new Error("Failed to save media asset: " + assetError?.message);

    // Captions: only worth generating if this is actually going to be
    // posted somewhere; a library-only upload doesn't need one yet.
    let platformCaptions: ReturnType<typeof formatPlatformCaptions> = {};
    if (platforms.length && !manualCaption) {
      const prompt = getSocialCaptionPrompt(business, { ideaPrompt: captionIdea || "A new update worth sharing", contentType: isVideo ? "video" : "image" });
      const responseText = (await aiOrchestrator.executeTask("analysis", prompt.user, "openai", { systemPrompt: prompt.system })) as string;
      const jsonStr = responseText.replace(/```json\n?|\n?```/g, "").trim();
      const captionMeta = JSON.parse(jsonStr);
      platformCaptions = formatPlatformCaptions(captionMeta, platforms as SocialPlatform[]);
    }

    // Always create at least one tracking row so the upload shows up in the
    // Posts page — even with no platform selected, connection_id is left
    // null and this just records the content as saved to the Media Library.
    const rows: Database["public"]["Tables"]["social_posts"]["Insert"][] = platforms.length
      ? platforms.map((platform) => ({
          business_id: business.id,
          connection_id: connections.find((c) => (c.platform as string) === platform)!.id as string | null,
          status: "draft",
          format: isVideo ? "video" : "image",
          idea_prompt: captionIdea || null,
          media_asset_id: asset.id,
          caption: manualCaption || platformCaptions[platform as SocialPlatform]?.text || "",
          title: platformCaptions[platform as SocialPlatform]?.title || null,
        }))
      : [{
          business_id: business.id,
          connection_id: null,
          status: "draft",
          format: isVideo ? "video" : "image",
          idea_prompt: captionIdea || null,
          media_asset_id: asset.id,
          caption: manualCaption || "",
        }];

    const { data: createdPosts, error } = await supabase.from("social_posts").insert(rows).select("id");
    if (error || !createdPosts) throw new Error(error?.message || "Failed to create post records");

    return NextResponse.json({ success: true, socialPostIds: createdPosts.map((p) => p.id), mediaAssetId: asset.id });
  } catch (error: any) {
    console.error("[SOCIAL_POSTS_UPLOAD]", error);
    return NextResponse.json({ error: error.message || "Failed to upload content" }, { status: 500 });
  }
}
