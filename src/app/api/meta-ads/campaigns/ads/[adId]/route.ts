import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { requireMetaAdAccountEnv, graphGet } from "@/services/meta/graph-client";
import { fetchObjectMetrics } from "@/modules/meta-ads/services/insights.service";
import { CampaignsService } from "@/modules/meta-ads/services/campaigns.service";
import { AdPageDetail } from "@/modules/meta-ads/types/meta-ads.types";

interface LiveAd {
  id: string;
  name: string;
  status: string;
  preview_shareable_link?: string;
  creative?: {
    id?: string;
    object_story_spec?: Record<string, any>;
    thumbnail_url?: string;
    image_url?: string;
  };
}

/** /meta-ads/campaigns/[campaignId]/[adSetId]/[adId] — one Ad's full
 * creative copy and its own metrics. Meta's ad creatives are immutable
 * objects (object_story_spec.video_data or .link_data depending on media
 * type) — same parsing this route's PATCH sibling (ads/[adId]/creative)
 * already does when editing, just read-only here. */
export async function GET(_request: Request, { params }: { params: Promise<{ adId: string }> }) {
  try {
    const { adId } = await params;
    const ourAd = await CampaignsService.getAdById(adId);
    if (!ourAd?.external_ad_id) return NextResponse.json({ error: "Ad not found" }, { status: 404 });

    const ourAdSet = await CampaignsService.getAdSetById(ourAd.ad_set_id);
    if (!ourAdSet) return NextResponse.json({ error: "Ad set not found" }, { status: 404 });
    const campaign = await CampaignsService.getCampaignById(ourAdSet.campaign_id);
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const { accessToken } = requireMetaAdAccountEnv();
    const [live, metrics] = await Promise.all([
      graphGet<LiveAd>(ourAd.external_ad_id, accessToken, {
        fields: "id,name,status,preview_shareable_link,creative{id,object_story_spec,thumbnail_url,image_url}",
      }),
      fetchObjectMetrics(ourAd.external_ad_id, accessToken),
    ]);

    const spec = live.creative?.object_story_spec || {};
    const isVideo = !!spec.video_data;
    const branch: Record<string, any> = (isVideo ? spec.video_data : spec.link_data) || {};
    const cta = branch.call_to_action || {};

    // Prefer our own creative's original media (full quality, works for
    // video playback) over Meta's thumbnail_url/image_url, which is only
    // ever a still image even for a video ad.
    let mediaUrl: string | undefined;
    let mediaType: "video" | "image" = isVideo ? "video" : "image";
    if (ourAd.creative_id) {
      const supabase = (await createClient()) as SupabaseClient<Database>;
      const { data: creative } = await supabase.from("meta_ad_creatives").select("media_urls, type").eq("id", ourAd.creative_id).maybeSingle();
      const urls = Array.isArray(creative?.media_urls) ? (creative!.media_urls as string[]) : [];
      if (urls[0]) mediaUrl = urls[0];
      if (creative?.type) mediaType = creative.type as "video" | "image";
    }
    if (!mediaUrl) mediaUrl = live.creative?.thumbnail_url || live.creative?.image_url || undefined;

    const detail: AdPageDetail = {
      id: ourAd.id,
      externalAdId: ourAd.external_ad_id,
      adSetId: ourAdSet.id,
      adSetName: ourAdSet.name,
      campaignId: campaign.id,
      campaignName: campaign.name,
      name: live.name,
      status: live.status,
      creativeId: ourAd.creative_id,
      externalCreativeId: ourAd.external_creative_id,
      mediaUrl,
      mediaType,
      headline: branch[isVideo ? "title" : "name"] || null,
      primaryText: branch.message || null,
      description: branch.description || branch.link_description || null,
      ctaType: cta.type || null,
      destinationUrl: cta.value?.link || branch.link || null,
      leadGenFormId: cta.value?.lead_gen_form_id || null,
      previewShareableLink: live.preview_shareable_link || null,
      createdAt: ourAd.created_at,
      metrics,
    };

    return NextResponse.json({ ad: detail });
  } catch (error: any) {
    console.error("[META_ADS_AD_DETAIL]", error);
    return NextResponse.json({ error: error.message || "Failed to load ad" }, { status: 500 });
  }
}
