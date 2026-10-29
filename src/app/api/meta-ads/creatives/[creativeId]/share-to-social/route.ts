import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";

/**
 * Copies a Meta Ads IMAGE creative into the Social Media Media Library so
 * it can be published there — images only, videos aren't supported (see
 * the feature's own scope). A Meta Ads creative's finished image only ever
 * lives on Kie's own CDN (`meta_ad_creatives.media_urls[0]`), never in our
 * own storage, so this downloads and re-uploads it into `business_media`
 * exactly the way generate-social-image.ts does for its own images, then
 * creates one library-only draft `social_posts` row (no platform chosen
 * yet) pointing at it — the same shape Social's own upload endpoint
 * produces. The caller then routes to Social's existing Publish screen via
 * `?mediaAssetId=`, so nothing downstream needs to know this image
 * originated in Meta Ads.
 */
export async function POST(request: Request, { params }: { params: Promise<{ creativeId: string }> }) {
  try {
    const { creativeId } = await params;
    const supabase = (await createClient()) as SupabaseClient<Database>;

    const { data: creative, error } = await supabase
      .from("meta_ad_creatives")
      .select("business_id, type, media_urls, idea_prompt")
      .eq("id", creativeId)
      .single();
    if (error || !creative) return NextResponse.json({ error: "Creative not found" }, { status: 404 });
    if (creative.type !== "image") return NextResponse.json({ error: "Only image creatives can be posted to Social Media" }, { status: 400 });

    const imageUrl = (creative.media_urls as string[] | null)?.[0];
    if (!imageUrl) return NextResponse.json({ error: "This creative has no image yet" }, { status: 400 });

    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Failed to download the creative's image: ${res.status}`);
    const buffer = await res.arrayBuffer();

    const fileName = `${creative.business_id}/social/from-meta-ads/${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage.from("business_media").upload(fileName, buffer, { contentType: "image/png" });
    if (uploadError) throw new Error("Image upload failed: " + uploadError.message);
    const { data: publicUrlData } = supabase.storage.from("business_media").getPublicUrl(fileName);

    const { data: asset, error: assetError } = await supabase
      .from("media_assets")
      .insert({
        business_id: creative.business_id,
        type: "image",
        source: "ai_generated",
        bucket: "business_media",
        storage_path: fileName,
        mime_type: "image/png",
        size_bytes: buffer.byteLength,
        metadata: { publicUrl: publicUrlData.publicUrl, fromMetaAdCreativeId: creativeId },
      })
      .select()
      .single();
    if (assetError || !asset) throw new Error("Failed to save media asset: " + assetError?.message);

    const { data: post, error: postError } = await supabase
      .from("social_posts")
      .insert({
        business_id: creative.business_id,
        connection_id: null,
        status: "draft",
        format: "image",
        idea_prompt: creative.idea_prompt || null,
        media_asset_id: asset.id,
        caption: "",
      })
      .select("id")
      .single();
    if (postError || !post) throw new Error("Failed to create the draft post: " + postError?.message);

    return NextResponse.json({ success: true, mediaAssetId: asset.id, socialPostId: post.id });
  } catch (error: any) {
    console.error("[META_ADS_SHARE_TO_SOCIAL]", error);
    return NextResponse.json({ error: error.message || "Failed to post this image to Social Media" }, { status: 500 });
  }
}
