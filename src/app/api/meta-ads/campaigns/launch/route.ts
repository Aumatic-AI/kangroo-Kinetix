import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { requireMetaAdAccountEnv, graphPost } from "@/services/meta/graph-client";
import { uploadMediaToMeta, resolvePageId, getOrCreatePixelId, buildTargeting, buildPlacements, resolveDeliverySettings, budgetField } from "@/modules/meta-ads/services/launch.service";
import { MetaAdsService } from "@/modules/meta-ads/services/meta-ads.service";
import { CampaignsService } from "@/modules/meta-ads/services/campaigns.service";
import { LaunchCampaignInput } from "@/modules/meta-ads/types/meta-ads.types";

export const maxDuration = 60; // video upload polling can take up to ~45s

/**
 * Creative -> a brand-new live Campaign + Ad Set + Creative + Ad, all
 * created PAUSED. Going live afterward is a separate, explicit action
 * (Smart Run or Resume) — Launch itself never starts spending money.
 * Adding to an *existing* campaign/ad set is deliberately NOT handled here
 * — that's "+ Add Ad Set" / "+ Add Creative" from the Campaign Details
 * view instead (see campaigns/[campaignId]/ad-sets and
 * campaigns/ad-sets/[adSetId]/ads), so this route only ever has one job.
 * Ported from the legacy project's /api/meta/launch route: same media-
 * upload/thumbnail/pixel/DSA steps, split into named functions
 * (launch.service.ts) instead of one 600-line handler, and every object
 * created is now written to our own campaigns/ad_sets/ads tables as a
 * pointer (external_*_id), which the legacy version never did.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LaunchCampaignInput;

    const required: (keyof LaunchCampaignInput)[] = ["creativeId", "campaignName", "objective", "adSetName", "adName", "headline", "primaryText", "ctaType", "websiteUrl"];
    for (const field of required) {
      if (!body[field]) return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
    if (body.budgetType === "lifetime" ? !body.lifetimeBudgetCents : !body.dailyBudgetCents) {
      return NextResponse.json({ error: `Missing required field: ${body.budgetType === "lifetime" ? "lifetimeBudgetCents" : "dailyBudgetCents"}` }, { status: 400 });
    }

    const { accessToken, adAccountId } = requireMetaAdAccountEnv();
    const supabase = (await createClient()) as SupabaseClient<Database>;

    const creative = await MetaAdsService.getCreativeById(supabase, body.creativeId);
    if (!creative) return NextResponse.json({ error: "Creative not found" }, { status: 404 });
    if (creative.status !== "approved") {
      return NextResponse.json({ error: "Only approved creatives can be launched. Approve it in Ad Library first." }, { status: 400 });
    }

    const mediaUrls = Array.isArray(creative.media_urls) ? (creative.media_urls as string[]) : [];
    if (!mediaUrls[0]) return NextResponse.json({ error: "This creative has no media to launch." }, { status: 400 });
    const isVideo = creative.type === "video";

    const businessId = creative.business_id;
    const business = await MetaAdsService.getBusinessById(supabase, businessId);
    if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

    const objective = body.objective;
    const isCbo = !!body.cbo;
    const leadGenFormId = body.leadGenFormId || null;

    const [mediaPayload, pageId] = await Promise.all([
      uploadMediaToMeta(mediaUrls[0], isVideo, accessToken, adAccountId),
      resolvePageId(accessToken),
    ]);

    const delivery = await resolveDeliverySettings(objective, leadGenFormId, body.optimizationGoal, pageId, () => getOrCreatePixelId(accessToken, adAccountId));
    const isLeadGenForm = objective === "OUTCOME_LEADS" && !!leadGenFormId;

    const startTime = body.startAt ? Math.floor(new Date(body.startAt).getTime() / 1000) : Math.floor(Date.now() / 1000);
    const endTime = body.endAt ? Math.floor(new Date(body.endAt).getTime() / 1000) : undefined;

    const targeting = buildTargeting(body);
    const placements = buildPlacements(body);

    // Meta requires these transparency fields on every ACTIVE ad globally, not just in the EU.
    const dsaFields = { dsa_beneficiary: business.name, dsa_payor: business.name };

    // ── Campaign ──
    const externalCampaignId = (
      await graphPost<{ id: string }>(`act_${adAccountId}/campaigns`, accessToken, {
        name: body.campaignName,
        objective,
        status: "PAUSED",
        special_ad_categories: ["NONE"],
        buying_type: body.buyingType || "AUCTION",
        ...(isCbo ? { ...budgetField(body), bid_strategy: "LOWEST_COST_WITHOUT_CAP" } : { is_adset_budget_sharing_enabled: false }),
      })
    ).id;

    // ── Ad Set ──
    const externalAdSetId = (
      await graphPost<{ id: string }>(`act_${adAccountId}/adsets`, accessToken, {
        name: body.adSetName,
        campaign_id: externalCampaignId,
        ...(!isCbo ? budgetField(body) : {}),
        start_time: startTime,
        ...(endTime ? { end_time: endTime } : {}),
        billing_event: "IMPRESSIONS",
        optimization_goal: delivery.optimizationGoal,
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        targeting,
        ...placements,
        ...dsaFields,
        ...(isLeadGenForm ? { destination_type: "ON_AD" } : {}),
        ...(delivery.promotedObject ? { promoted_object: delivery.promotedObject } : {}),
        status: "PAUSED",
      })
    ).id;

    // ── Creative ──
    const ctaValue = leadGenFormId ? { lead_gen_form_id: leadGenFormId } : { link: body.websiteUrl };
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

    // ── Ad ──
    const externalAdId = (
      await graphPost<{ id: string }>(`act_${adAccountId}/ads`, accessToken, {
        name: body.adName,
        adset_id: externalAdSetId,
        creative: { creative_id: externalCreativeId },
        status: "PAUSED",
        ...(delivery.trackingSpecs ? { tracking_specs: delivery.trackingSpecs } : {}),
      })
    ).id;

    // ── Persist our own pointer rows ──
    const campaignRow = await CampaignsService.createCampaign({
      business_id: businessId,
      name: body.campaignName,
      objective,
      status: "paused",
      daily_budget_cents: isCbo && body.budgetType === "daily" ? body.dailyBudgetCents ?? null : null,
      lifetime_budget_cents: isCbo && body.budgetType === "lifetime" ? body.lifetimeBudgetCents ?? null : null,
      currency: "USD",
      start_at: body.startAt || new Date().toISOString(),
      end_at: body.endAt || null,
      ad_account_id: null,
      external_campaign_id: externalCampaignId,
    });

    const adSetRow = await CampaignsService.createAdSet({
      business_id: businessId,
      campaign_id: campaignRow.id,
      name: body.adSetName,
      status: "paused",
      daily_budget_cents: !isCbo && body.budgetType === "daily" ? body.dailyBudgetCents ?? null : null,
      lifetime_budget_cents: !isCbo && body.budgetType === "lifetime" ? body.lifetimeBudgetCents ?? null : null,
      targeting,
      placements: { mode: body.placementsMode || "advantage_plus", ...placements },
      optimization_goal: delivery.optimizationGoal,
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      start_at: body.startAt || new Date().toISOString(),
      end_at: body.endAt || null,
      external_adset_id: externalAdSetId,
    });

    const adRow = await CampaignsService.createAd({
      business_id: businessId,
      ad_set_id: adSetRow.id,
      name: body.adName,
      status: "paused",
      creative_id: creative.id,
      external_ad_id: externalAdId,
      external_creative_id: externalCreativeId,
    });

    return NextResponse.json({
      success: true,
      campaignId: campaignRow.id,
      adSetId: adSetRow.id,
      adId: adRow.id,
      externalCampaignId,
      externalAdSetId,
      externalAdId,
    });
  } catch (error: any) {
    console.error("[META_ADS_CAMPAIGNS_LAUNCH]", error);
    return NextResponse.json({ error: error.message || "Failed to launch campaign" }, { status: 500 });
  }
}
