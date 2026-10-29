import { NextRequest, NextResponse } from "next/server";
import { requireMetaAdAccountEnv, graphGetAllPages } from "@/services/meta/graph-client";
import { computeAdScore, scoreLabel, SCORE_METHODOLOGY } from "@/modules/meta-ads/services/scoring";
import { paginationMeta, rangeFor, PAGE_SIZE_COMPACT } from "@/lib/pagination";

export const dynamic = "force-dynamic";

const RANGE_TO_PRESET: Record<string, string> = {
  today: "today",
  "7d": "last_7d",
  "14d": "last_14d",
  "30d": "last_30d",
  all: "maximum",
};

interface LiveAd {
  id: string;
  name: string;
  status: string;
  effective_status?: string;
  campaign_id: string;
  adset_id: string;
  creative?: { id?: string; thumbnail_url?: string; image_url?: string; title?: string; body?: string; call_to_action_type?: string };
}

const VALID_STATUSES = ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"];

/**
 * Always live — the whole point of this route is that "today" can never
 * be stale, so it never reads ad_performance_daily (that table exists only
 * for the nightly sync job, unrelated to this page). One nested-shape call
 * for the ad/campaign structure, one flat Insights API call at level=ad
 * for the numbers — both cover the whole account per request, not one
 * call per ad.
 */
export async function GET(request: NextRequest) {
  try {
    const { accessToken, adAccountId } = requireMetaAdAccountEnv();
    const { searchParams } = request.nextUrl;
    const range = searchParams.get("range") || "7d";
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const page = Number(searchParams.get("page")) || 1;
    const limit = Number(searchParams.get("limit")) || PAGE_SIZE_COMPACT;

    const insightParams: Record<string, string> = {
      level: "ad",
      fields: "ad_id,spend,impressions,inline_link_clicks,inline_link_click_ctr,cpc,cpm,reach,actions",
      limit: "200",
    };
    if (range === "custom" && start && end) {
      insightParams.time_range = JSON.stringify({ since: start, until: end });
    } else {
      insightParams.date_preset = RANGE_TO_PRESET[range] || "last_7d";
    }

    const [adsRaw, campaignsRaw, insightsRaw] = await Promise.all([
      graphGetAllPages<LiveAd>(`act_${adAccountId}/ads`, accessToken, {
        fields: "id,name,status,effective_status,campaign_id,adset_id,creative{id,thumbnail_url,image_url,title,body,call_to_action_type}",
        limit: "200",
      }),
      graphGetAllPages<{ id: string; name: string }>(`act_${adAccountId}/campaigns`, accessToken, { fields: "id,name", limit: "200" }),
      graphGetAllPages<Record<string, any>>(`act_${adAccountId}/insights`, accessToken, insightParams).catch(() => []),
    ]);

    const campaignNameById = new Map(campaignsRaw.map((c) => [c.id, c.name]));
    const insightByAdId = new Map(insightsRaw.map((i) => [i.ad_id as string, i]));

    const ads = adsRaw
      .filter((ad) => VALID_STATUSES.includes((ad.effective_status || ad.status || "").toUpperCase()))
      .map((ad) => {
        const ins = insightByAdId.get(ad.id) || {};
        const spend = parseFloat(ins.spend || "0");
        const impressions = parseInt(ins.impressions || "0", 10);
        const clicks = parseInt(ins.inline_link_clicks || "0", 10);
        const ctr = parseFloat(ins.inline_link_click_ctr || "0");
        const cpm = parseFloat(ins.cpm || "0");
        const cpc = clicks > 0 ? parseFloat(ins.cpc || "0") : 0;
        const score = computeAdScore(spend, impressions, clicks, ctr, cpm);
        return {
          adId: ad.id,
          adName: ad.name,
          campaignId: ad.campaign_id,
          campaignName: campaignNameById.get(ad.campaign_id) || "",
          status: (ad.effective_status || ad.status || "").toUpperCase(),
          thumbnailUrl: ad.creative?.thumbnail_url || ad.creative?.image_url || undefined,
          headline: ad.creative?.title || null,
          body: ad.creative?.body || null,
          cta: ad.creative?.call_to_action_type || null,
          spend: parseFloat(spend.toFixed(2)),
          impressions,
          clicks,
          ctr: parseFloat(ctr.toFixed(4)),
          cpc: parseFloat(cpc.toFixed(2)),
          cpm: parseFloat(cpm.toFixed(2)),
          reach: parseInt(ins.reach || "0", 10),
          score,
          scoreLabel: scoreLabel(score),
        };
      })
      .sort((a, b) => b.score - a.score);

    // Summary is always over the full set, computed before slicing to a
    // page — otherwise the KPI row would silently change per page.
    const totalSpend = ads.reduce((s, a) => s + a.spend, 0);
    const totalImpressions = ads.reduce((s, a) => s + a.impressions, 0);
    const totalClicks = ads.reduce((s, a) => s + a.clicks, 0);

    // No DB table backs this list (see the comment above) — the whole
    // account's ads are already fetched and sorted by score above, so
    // "pagination" here is a post-fetch slice of that in-memory array.
    const [from, to] = rangeFor(page, limit);
    const pageAds = ads.slice(from, to + 1);

    return NextResponse.json({
      ads: pageAds,
      summary: {
        totalAds: ads.length,
        totalSpend: parseFloat(totalSpend.toFixed(2)),
        totalImpressions,
        totalClicks,
        avgCtr: totalImpressions > 0 ? parseFloat(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0,
        avgCpm: totalImpressions > 0 ? parseFloat(((totalSpend / totalImpressions) * 1000).toFixed(2)) : 0,
        scoreMethodology: SCORE_METHODOLOGY,
      },
      ...paginationMeta(ads.length, page, limit),
    });
  } catch (error: any) {
    console.error("[META_ADS_REPORTS]", error);
    return NextResponse.json({ error: error.message || "Failed to load reports" }, { status: 500 });
  }
}
