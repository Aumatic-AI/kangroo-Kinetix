import { NextResponse } from "next/server";
import { requireMetaAdAccountEnv, graphGet, graphPost } from "@/services/meta/graph-client";
import { fetchObjectMetrics } from "@/modules/meta-ads/services/insights.service";
import { CampaignsService } from "@/modules/meta-ads/services/campaigns.service";
import { AdSetPageDetail } from "@/modules/meta-ads/types/meta-ads.types";

interface LiveAdSet {
  id: string;
  name: string;
  status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  ads?: { data?: { id: string; name: string; status: string; creative?: { id?: string; thumbnail_url?: string; image_url?: string } }[] };
}

/** /meta-ads/campaigns/[campaignId]/[adSetId] — this Ad Set's own fields
 * (status/budget always live from Meta; targeting/placements read from our
 * own pointer row, since those are set once at creation and not something
 * Meta lets you edit outside this app) plus the basic-fields list of its
 * Ads (name/status/thumbnail only — a given Ad's full copy is a separate
 * page, campaigns/ads/[adId]). */
export async function GET(_request: Request, { params }: { params: Promise<{ adSetId: string }> }) {
  try {
    const { adSetId } = await params;
    const ourAdSet = await CampaignsService.getAdSetById(adSetId);
    if (!ourAdSet?.external_adset_id) return NextResponse.json({ error: "Ad set not found" }, { status: 404 });

    const campaign = await CampaignsService.getCampaignById(ourAdSet.campaign_id);
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const { accessToken } = requireMetaAdAccountEnv();
    const [live, metrics] = await Promise.all([
      graphGet<LiveAdSet>(ourAdSet.external_adset_id, accessToken, {
        fields: "id,name,status,daily_budget,lifetime_budget,ads{id,name,status,creative{id,thumbnail_url,image_url}}",
      }),
      fetchObjectMetrics(ourAdSet.external_adset_id, accessToken),
    ]);

    const ourAds = await CampaignsService.getAdsByAdSets([adSetId]);
    const ourAdByExternalId = new Map(ourAds.map((a) => [a.external_ad_id, a]));

    const targeting = (ourAdSet.targeting || {}) as Record<string, any>;
    const geo = targeting.geo_locations || {};
    const placementsRaw = (ourAdSet.placements || {}) as Record<string, any>;

    const detail: AdSetPageDetail = {
      id: ourAdSet.id,
      externalAdsetId: ourAdSet.external_adset_id,
      campaignId: campaign.id,
      campaignName: campaign.name,
      name: live.name,
      status: live.status,
      dailyBudgetCents: live.daily_budget ? parseInt(live.daily_budget, 10) : ourAdSet.daily_budget_cents,
      lifetimeBudgetCents: live.lifetime_budget ? parseInt(live.lifetime_budget, 10) : ourAdSet.lifetime_budget_cents,
      optimizationGoal: ourAdSet.optimization_goal,
      bidStrategy: ourAdSet.bid_strategy,
      startAt: ourAdSet.start_at,
      endAt: ourAdSet.end_at,
      createdAt: ourAdSet.created_at,
      targetingSummary: {
        countries: geo.countries || [],
        regions: (geo.regions || []).map((r: any) => (typeof r === "string" ? r : r.key)),
        cities: (geo.cities || []).map((c: any) => (typeof c === "string" ? c : c.key)),
        ageMin: targeting.age_min ?? null,
        ageMax: targeting.age_max ?? null,
        genders: targeting.genders || [],
        advantageAudience: !!targeting.targeting_automation?.advantage_audience,
      },
      placementsSummary: {
        mode: placementsRaw.mode === "manual" ? "manual" : "advantage_plus",
        publisherPlatforms: placementsRaw.publisher_platforms || [],
        facebookPositions: placementsRaw.facebook_positions || [],
        instagramPositions: placementsRaw.instagram_positions || [],
      },
      metrics,
      ads: (live.ads?.data || []).map((ad) => {
        const ourAd = ourAdByExternalId.get(ad.id);
        return {
          id: ourAd?.id || ad.id,
          externalAdId: ad.id,
          name: ad.name,
          status: ad.status,
          thumbnailUrl: ad.creative?.thumbnail_url || ad.creative?.image_url || undefined,
        };
      }),
    };

    return NextResponse.json({ adSet: detail });
  } catch (error: any) {
    console.error("[META_ADS_AD_SET_DETAIL]", error);
    return NextResponse.json({ error: error.message || "Failed to load ad set" }, { status: 500 });
  }
}

/**
 * Editable fields: name, end date, age range, gender, Advantage+ Audience,
 * and — only when this ad set already has its own budget (i.e. the parent
 * campaign isn't using Campaign Budget Optimization) — the amount of
 * whichever budget type it already has. Age/gender/Advantage+ Audience all
 * live inside Meta's single `targeting` object, which Meta replaces
 * wholesale on update (no partial merge on Meta's side) — so this rebuilds
 * the full object from our own stored `ad_sets.targeting` row, only
 * overriding the fields actually being edited, to avoid silently wiping
 * out geo_locations/location_types.
 *
 * Not editable, and deliberately not accepted here: optimization goal, bid
 * strategy, locations, placements, start date, and switching budget type —
 * same reasoning as the Campaign PATCH (see its own comment), plus
 * optimization goal/bid strategy carrying real cascading-validation risk
 * (pixel requirements, Lead Gen Form compatibility) that create/launch
 * already handles but an edit path doesn't reimplement here.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ adSetId: string }> }) {
  try {
    const { adSetId } = await params;
    const body = await request.json();
    const ourAdSet = await CampaignsService.getAdSetById(adSetId);
    if (!ourAdSet?.external_adset_id) return NextResponse.json({ error: "Ad set not found" }, { status: 404 });

    const { accessToken } = requireMetaAdAccountEnv();
    const payload: Record<string, unknown> = {};
    if (body.name) payload.name = body.name;
    if (body.endAt) payload.end_time = Math.floor(new Date(body.endAt).getTime() / 1000);
    if (typeof body.dailyBudgetCents === "number" && ourAdSet.daily_budget_cents != null) {
      payload.daily_budget = body.dailyBudgetCents;
    } else if (typeof body.lifetimeBudgetCents === "number" && ourAdSet.lifetime_budget_cents != null) {
      payload.lifetime_budget = body.lifetimeBudgetCents;
    }

    const hasTargetingEdit = body.ageMin !== undefined || body.ageMax !== undefined || body.gender !== undefined || body.advantageAudience !== undefined;
    if (hasTargetingEdit) {
      const currentTargeting = (ourAdSet.targeting || {}) as Record<string, unknown>;
      payload.targeting = {
        ...currentTargeting,
        ...(body.ageMin !== undefined ? { age_min: body.ageMin } : {}),
        ...(body.ageMax !== undefined ? { age_max: body.ageMax } : {}),
        ...(body.gender !== undefined ? { genders: body.gender === 1 || body.gender === 2 ? [body.gender] : undefined } : {}),
        ...(body.advantageAudience !== undefined ? { targeting_automation: { advantage_audience: body.advantageAudience ? 1 : 0 } } : {}),
      };
    }

    if (Object.keys(payload).length > 0) {
      await graphPost(ourAdSet.external_adset_id, accessToken, payload);
    }

    await CampaignsService.updateAdSet(adSetId, {
      ...(body.name ? { name: body.name } : {}),
      ...(body.endAt ? { end_at: body.endAt } : {}),
      ...(payload.daily_budget != null ? { daily_budget_cents: body.dailyBudgetCents } : {}),
      ...(payload.lifetime_budget != null ? { lifetime_budget_cents: body.lifetimeBudgetCents } : {}),
      ...(payload.targeting ? { targeting: payload.targeting } : {}),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[META_ADS_AD_SET_UPDATE]", error);
    return NextResponse.json({ error: error.message || "Failed to update ad set" }, { status: 500 });
  }
}
