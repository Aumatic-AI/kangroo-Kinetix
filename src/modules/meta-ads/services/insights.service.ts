/**
 * Meta Ads Insights Service
 *
 * Ports the proven Graph API calls from the legacy project's
 * /api/meta/live-ads and /api/meta/report-analysis routes: fetch the
 * ad account's ads + campaigns, then their performance insights,
 * paginating through Meta's cursor-based results. Used by
 * meta-ads-performance-sync.job.ts to populate ad_performance_daily —
 * this service only reads from Meta, it never writes to Supabase.
 */

import { graphGetAllPages } from "@/services/meta/graph-client";
import { MetaMetrics } from "../types/meta-ads.types";

export interface MetaAdWithInsights {
  metaAdId: string;
  name: string;
  campaignName: string;
  status: string;
  headline: string;
  body: string;
  imageUrl: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number;
  cpcCents: number;
  cpmCents: number;
  conversions: number;
}

function countLeads(actions: Array<{ action_type: string; value: string }> | undefined): number {
  if (!actions) return 0;
  const lead = actions.find((a) => a.action_type === "lead")?.value;
  const onsiteLead = actions.find((a) => a.action_type === "onsite_conversion.lead_grouped")?.value;
  return parseInt(lead || "0", 10) + parseInt(onsiteLead || "0", 10);
}

/** Lifetime-to-date metrics for one Campaign/Ad Set/Ad — used by the three
 * detail pages (Campaign/Ad Set/Ad). Insights live directly on any object's
 * own id as an edge, so no filtering/account-wide fetch is needed the way
 * the Reports page does it. Zeroed rather than thrown when Meta has no
 * insights yet (e.g. a brand-new or never-delivered object). */
export async function fetchObjectMetrics(objectId: string, accessToken: string): Promise<MetaMetrics> {
  try {
    const rows = await graphGetAllPages<Record<string, any>>(`${objectId}/insights`, accessToken, {
      fields: "spend,impressions,inline_link_clicks,inline_link_click_ctr,cpm,reach,actions",
      date_preset: "maximum",
    });
    const ins = rows[0] || {};
    const spend = parseFloat(ins.spend || "0");
    const impressions = parseInt(ins.impressions || "0", 10);
    const clicks = parseInt(ins.inline_link_clicks || "0", 10);
    const ctr = parseFloat(ins.inline_link_click_ctr || "0");
    const cpm = parseFloat(ins.cpm || "0");
    const reach = parseInt(ins.reach || "0", 10);
    return {
      spend: parseFloat(spend.toFixed(2)),
      impressions,
      clicks,
      ctr: parseFloat(ctr.toFixed(4)),
      cpm: parseFloat(cpm.toFixed(2)),
      reach,
      leads: countLeads(ins.actions),
    };
  } catch {
    return { spend: 0, impressions: 0, clicks: 0, ctr: 0, cpm: 0, reach: 0, leads: 0 };
  }
}

export class MetaAdsInsightsService {
  /**
   * Fetches every active/paused ad on the account, joined with its campaign
   * name and its performance insights over the given date_preset. Insights
   * are fetched once at ad level for the whole account, not per-ad, to stay
   * within Meta's rate limits.
   */
  static async fetchAdsWithInsights(
    accessToken: string,
    adAccountId: string,
    datePreset: string = "yesterday"
  ): Promise<MetaAdWithInsights[]> {
    const adsRaw = await graphGetAllPages(`act_${adAccountId}/ads`, accessToken, {
      fields: "id,name,status,effective_status,campaign_id,creative{title,body,image_url,thumbnail_url}",
      limit: "200",
    });

    if (!adsRaw.length) return [];

    const campaignsRaw = await graphGetAllPages(`act_${adAccountId}/campaigns`, accessToken, {
      fields: "id,name",
      limit: "200",
    });
    const campaignNameById = new Map(campaignsRaw.map((c) => [c.id as string, c.name as string]));

    const insightFields = "ad_id,spend,impressions,clicks,inline_link_clicks,inline_link_click_ctr,cpc,cpm,reach,actions";
    let insightsRaw: Record<string, any>[] = [];
    try {
      insightsRaw = await graphGetAllPages(`act_${adAccountId}/insights`, accessToken, {
        level: "ad",
        fields: insightFields,
        date_preset: datePreset,
        limit: "200",
      });
    } catch {
      // No insights yet for this period (e.g. brand new account) — proceed with zeroed metrics.
    }
    const insightByAdId = new Map(insightsRaw.map((i) => [i.ad_id as string, i]));

    return adsRaw
      .filter((ad) => ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"].includes((ad.effective_status || ad.status || "").toUpperCase()))
      .map((ad) => {
        const ins = insightByAdId.get(ad.id as string) || {};
        const creative = ad.creative || {};
        const spend = parseFloat(ins.spend || "0");
        const impressions = parseInt(ins.impressions || "0", 10);
        const clicks = parseInt(ins.inline_link_clicks || ins.clicks || "0", 10);
        return {
          metaAdId: ad.id as string,
          name: ad.name as string,
          campaignName: campaignNameById.get(ad.campaign_id as string) || "",
          status: (ad.effective_status || ad.status || "").toUpperCase(),
          headline: creative.title || "",
          body: creative.body || "",
          imageUrl: creative.image_url || creative.thumbnail_url || "",
          spendCents: Math.round(spend * 100),
          impressions,
          clicks,
          reach: parseInt(ins.reach || "0", 10),
          ctr: parseFloat(ins.inline_link_click_ctr || "0"),
          cpcCents: Math.round(parseFloat(ins.cpc || "0") * 100),
          cpmCents: Math.round(parseFloat(ins.cpm || "0") * 100),
          conversions: countLeads(ins.actions),
        };
      });
  }
}
