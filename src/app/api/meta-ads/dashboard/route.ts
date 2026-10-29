import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { MetaAdsService } from "@/modules/meta-ads/services/meta-ads.service";
import { aggregateByAd, diagnosePattern, type AggregatedAd, type DailyRow } from "@/services/ai/self-ad-processor";

export const dynamic = "force-dynamic";

const SCORE_LABELS: AggregatedAd["scoreLabel"][] = ["Excellent", "Good", "Average", "Needs Work", "Critical"];

const RANGE_DAYS = { "7d": 7, "14d": 14, "30d": 30, "90d": 90 } as const;
export type MetaAdsDashboardRange = keyof typeof RANGE_DAYS | "all";

// "all" has no fixed day count — it's derived from the earliest real row we
// have, capped so the trend chart doesn't grow unbounded years from now.
const ALL_TIME_CAP_DAYS = 180;

/** One ad within a score bucket. `link` is only present when this Meta ad
 * has a matching row in our own `ads` table (i.e. it was launched through
 * Campaign Launch) — an ad scraped/synced from Meta with no local record
 * has nowhere in Kinetix to navigate to, so the UI must not treat it as
 * clickable. */
interface ScoredAdEntry {
  metaAdId: string;
  ctr: number;
  spendCents: number;
  clicks: number;
  impressions: number;
  daysRunning: number;
  adText: string | null;
  mediaUrl: string | null;
  link: { campaignId: string; adSetId: string; adId: string } | null;
}

interface MetaAdsDashboardResponse {
  rangeDays: number;
  kpis: {
    spendCents: number;
    avgCtr: number;
    adsTracked: number;
  };
  spendTrend: { date: string; spendCents: number }[];
  scoreBuckets: { label: AggregatedAd["scoreLabel"]; count: number; ads: ScoredAdEntry[] }[];
}

function emptyResponse(rangeDays: number): MetaAdsDashboardResponse {
  return {
    rangeDays,
    kpis: { spendCents: 0, avgCtr: 0, adsTracked: 0 },
    spendTrend: [],
    scoreBuckets: SCORE_LABELS.map((label) => ({ label, count: 0, ads: [] })),
  };
}

/** Everything the Meta Ads dashboard renders, in one call: a spend trend +
 * self-ad score distribution computed fresh from ad_performance_daily
 * (`src/services/ai/self-ad-processor.ts`'s scoring/pattern logic). Deliberately
 * excludes every prose field (executive_summary, ai_overview, key_insights,
 * etc.) — this page shows metrics/charts only. The weekly AI self-ad-analysis
 * report and the earlier competitor-intelligence job/dashboard display were
 * both removed as unused features — this chart is computed fresh here and
 * never depended on either of them.
 *
 * `?range=7d|14d|30d|90d|all` (default 30d) only rescopes the spend/CTR KPIs and
 * the spend trend chart — the only genuinely "last N days" data here. The
 * self-ad score distribution is a lifetime/seasoning computation (needs 7+
 * days of an ad's own tracked history to score it at all, unrelated to the
 * viewer's chosen window), so it stays constant across ranges. */
export async function GET(request: NextRequest) {
  const rangeParam = (request.nextUrl.searchParams.get("range") || "30d") as MetaAdsDashboardRange;
  const isAllTime = rangeParam === "all";

  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const businessId = await MetaAdsService.getFirstBusinessId(supabase);
    if (!businessId) return NextResponse.json(emptyResponse(isAllTime ? 30 : RANGE_DAYS[rangeParam] ?? RANGE_DAYS["30d"]));

    let rangeDays: number;
    if (isAllTime) {
      const { data: earliestRow } = await supabase
        .from("ad_performance_daily")
        .select("metric_date")
        .eq("business_id", businessId)
        .order("metric_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      const daysSinceEarliest = earliestRow?.metric_date
        ? Math.ceil((Date.now() - new Date(earliestRow.metric_date).getTime()) / 86_400_000) + 1
        : 30;
      rangeDays = Math.min(ALL_TIME_CAP_DAYS, Math.max(1, daysSinceEarliest));
    } else {
      rangeDays = RANGE_DAYS[rangeParam] ?? RANGE_DAYS["30d"];
    }

    const since = new Date(Date.now() - rangeDays * 86_400_000).toISOString().slice(0, 10);

    const [{ data: recentRows }, { data: allRows }] = await Promise.all([
      supabase
        .from("ad_performance_daily")
        .select("metric_date, spend_cents, impressions, clicks")
        .eq("business_id", businessId)
        .gte("metric_date", since),
      supabase
        .from("ad_performance_daily")
        .select("meta_ad_id, metric_date, spend_cents, impressions, clicks, conversions, ctr, cpc_cents, cpm_cents, ad_text, media_url, format")
        .eq("business_id", businessId),
    ]);

    // Spend trend — zero-filled for every day in the window so the line
    // never breaks on a day with no synced rows.
    const spendByDay = new Map<string, number>();
    for (const row of recentRows || []) {
      spendByDay.set(row.metric_date, (spendByDay.get(row.metric_date) || 0) + (row.spend_cents || 0));
    }
    const spendTrend: MetaAdsDashboardResponse["spendTrend"] = [];
    for (let i = rangeDays - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      spendTrend.push({ date, spendCents: spendByDay.get(date) || 0 });
    }

    const recentImpressions = (recentRows || []).reduce((s, r) => s + (r.impressions || 0), 0);
    const recentClicks = (recentRows || []).reduce((s, r) => s + (r.clicks || 0), 0);
    const spendCents = (recentRows || []).reduce((s, r) => s + (r.spend_cents || 0), 0);
    const avgCtr = recentImpressions > 0 ? (recentClicks / recentImpressions) * 100 : 0;

    // Self-ad score distribution — aggregate/diagnose pipeline from
    // self-ad-processor.ts, computed fresh here on every load.
    const aggregated = aggregateByAd((allRows || []) as unknown as DailyRow[]);
    const seasoned = aggregated.filter((a) => a.daysRunning >= 7);
    const accountAvgCpcCents = seasoned.length
      ? Math.round(seasoned.reduce((s, a) => s + a.spendCents, 0) / Math.max(1, seasoned.reduce((s, a) => s + a.clicks, 0)))
      : 0;
    for (const ad of seasoned) diagnosePattern(ad, accountAvgCpcCents);

    // Only ads actually launched through Campaign Launch have a row here —
    // this is what gates whether a bar's ad list can link into the
    // Campaigns section at all (see ScoredAdEntry.link's doc comment).
    const metaAdIds = seasoned.map((a) => a.metaAdId);
    const { data: adRows } = metaAdIds.length
      ? await supabase.from("ads").select("id, external_ad_id, ad_set_id, ad_sets(campaign_id)").eq("business_id", businessId).in("external_ad_id", metaAdIds)
      : { data: [] as any[] };
    const linkByMetaAdId = new Map<string, ScoredAdEntry["link"]>();
    for (const row of adRows || []) {
      const adSet = (row as any).ad_sets;
      if (row.external_ad_id && adSet?.campaign_id) {
        linkByMetaAdId.set(row.external_ad_id, { campaignId: adSet.campaign_id, adSetId: row.ad_set_id, adId: row.id });
      }
    }

    const scoreBuckets: MetaAdsDashboardResponse["scoreBuckets"] = SCORE_LABELS.map((label) => {
      const adsInBucket: ScoredAdEntry[] = seasoned
        .filter((a) => a.scoreLabel === label)
        .sort((a, b) => b.ctr - a.ctr)
        .map((a) => ({
          metaAdId: a.metaAdId,
          ctr: Math.round(a.ctr * 100) / 100,
          spendCents: a.spendCents,
          clicks: a.clicks,
          impressions: a.impressions,
          daysRunning: a.daysRunning,
          adText: a.adText,
          mediaUrl: a.mediaUrl,
          link: linkByMetaAdId.get(a.metaAdId) || null,
        }));
      return { label, count: adsInBucket.length, ads: adsInBucket };
    });

    const response: MetaAdsDashboardResponse = {
      rangeDays,
      kpis: {
        spendCents,
        avgCtr: Math.round(avgCtr * 100) / 100,
        adsTracked: aggregated.length,
      },
      spendTrend,
      scoreBuckets,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[META_ADS_DASHBOARD]", error);
    return NextResponse.json({ error: error.message || "Failed to load dashboard" }, { status: 500 });
  }
}
