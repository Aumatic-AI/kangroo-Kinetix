import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { requireMetaAdAccountEnv, graphPost } from "@/services/meta/graph-client";
import { uploadMediaToMeta, resolvePageId } from "@/modules/meta-ads/services/launch.service";
import { MetaAdsService } from "@/modules/meta-ads/services/meta-ads.service";
import { CampaignsService } from "@/modules/meta-ads/services/campaigns.service";
import { CreateAdInput } from "@/modules/meta-ads/types/meta-ads.types";

export const maxDuration = 60; // video upload polling can take up to ~45s

/**
 * "+ Add Creative" on an existing Ad Set, from the Campaign Details view.
 * Creates a new Ad (+ Creative) under an ad set that already exists,
 * inheriting its targeting/budget/optimization goal untouched — those were
 * fixed when the ad set was created and aren't re-asked here. If the ad
 * set was built for native Lead Gen Forms (optimization_goal ===
 * "LEAD_GENERATION"), every ad under it must also use a lead form — Meta
 * doesn't allow mixing lead-form ads and website-link ads in the same ad
 * set — so a leadGenFormId is required in that case instead of a website URL.
 */
export async function POST(request: Request, { params }: { params: Promise<{ adSetId: string }> }) {
  try {
    const { adSetId } = await params;
    const body = (await request.json()) as CreateAdInput;

    const required: (keyof CreateAdInput)[] = ["creativeId", "adName", "headline", "primaryText", "ctaType"];
    for (const field of required) {
      if (!body[field]) return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }

    const supabase = (await createClient()) as SupabaseClient<Database>;
    const { data: adSet, error: adSetError } = await supabase.from("ad_sets").select("*").eq("id", adSetId).single();
    if (adSetError || !adSet?.external_adset_id) return NextResponse.json({ error: "Ad set not found or not yet launched" }, { status: 404 });

    const isLeadGenForm = adSet.optimization_goal === "LEAD_GENERATION";
    if (isLeadGenForm && !body.leadGenFormId) {
      return NextResponse.json({ error: "This ad set was built for Instant Form leads — pick a lead form for this ad." }, { status: 400 });
    }
    if (!isLeadGenForm && !body.websiteUrl) {
      return NextResponse.json({ error: "Destination URL is required." }, { status: 400 });
    }

    const { accessToken, adAccountId } = requireMetaAdAccountEnv();

    const creative = await MetaAdsService.getCreativeById(supabase, body.creativeId);
    if (!creative) return NextResponse.json({ error: "Creative not found" }, { status: 404 });
    if (creative.status !== "approved") {
      return NextResponse.json({ error: "Only approved creatives can be launched. Approve it in Ad Library first." }, { status: 400 });
    }
    const mediaUrls = Array.isArray(creative.media_urls) ? (creative.media_urls as string[]) : [];
    if (!mediaUrls[0]) return NextResponse.json({ error: "This creative has no media to launch." }, { status: 400 });
    const isVideo = creative.type === "video";

    const [mediaPayload, pageId] = await Promise.all([
      uploadMediaToMeta(mediaUrls[0], isVideo, accessToken, adAccountId),
      resolvePageId(accessToken),
    ]);

    const ctaValue = body.leadGenFormId ? { lead_gen_form_id: body.leadGenFormId } : { link: body.websiteUrl };
    const objectStorySpec = isVideo
      ? {
          page_id: pageId,
          video_data: {
            video_id: mediaPayload.videoId,
            image_hash: mediaPayload.imageHash,
            title: body.headline,
            message: body.primaryText,
            ...(body.description ? { link_description: body.description } : {}),
            call_to_action: { type: body.ctaType, value: ctaValue },
          },
        }
      : {
          page_id: pageId,
          link_data: {
            image_hash: mediaPayload.imageHash,
            link: body.websiteUrl,
            message: body.primaryText,
            name: body.headline,
            ...(body.description ? { description: body.description } : {}),
            call_to_action: { type: body.ctaType, value: ctaValue },
          },
        };

    const externalCreativeId = (
      await graphPost<{ id: string }>(`act_${adAccountId}/adcreatives`, accessToken, {
        name: `Creative_${body.adName}`,
        object_story_spec: objectStorySpec,
      })
    ).id;

    const externalAdId = (
      await graphPost<{ id: string }>(`act_${adAccountId}/ads`, accessToken, {
        name: body.adName,
        adset_id: adSet.external_adset_id,
        creative: { creative_id: externalCreativeId },
        status: "PAUSED",
      })
    ).id;

    const adRow = await CampaignsService.createAd({
      business_id: adSet.business_id,
      ad_set_id: adSet.id,
      name: body.adName,
      status: "paused",
      creative_id: creative.id,
      external_ad_id: externalAdId,
      external_creative_id: externalCreativeId,
    });

    return NextResponse.json({ success: true, adId: adRow.id, externalAdId });
  } catch (error: any) {
    console.error("[META_ADS_ADD_AD]", error);
    return NextResponse.json({ error: error.message || "Failed to add ad" }, { status: 500 });
  }
}
