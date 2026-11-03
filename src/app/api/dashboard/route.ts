import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { MetaAdsService } from "@/modules/meta-ads/services/meta-ads.service";
import { env } from "@/config/env";
import { FEATURES } from "@/config/features";
import { UploadPostService, SUPPORTED_UPLOAD_POST_PLATFORMS, type UploadPostProfileAnalytics } from "@/services/upload-post";

export const dynamic = "force-dynamic";

const RANGE_DAYS = { "7d": 7, "14d": 14, "30d": 30, "90d": 90, all: 180 } as const;
export type RootDashboardRange = keyof typeof RANGE_DAYS;

interface RootDashboardResponse {
  rangeDays: number;
  kpis: {
    totalLeads: number;
    totalReach: number;
    metaActiveCampaigns: number;
    metaSpendCents: number;
    socialFollowers: number | null;
    socialEngagement: number | null;
  };
  funnel: { stage: string; value: number }[];
  leadsBySource: { date: string; meta: number }[];
  reachTrend: { date: string; meta: number; social: number }[];
  moduleTrends: {
    meta: { headline: string; headlineLabel: string; secondary: string; data: { date: string; value: number }[] };
    social: { headline: string; headlineLabel: string; secondary: string; data: { date: string; value: number }[] };
  };
  channelTable: { channel: string; primaryLabel: string; primaryValue: string; resultLabel: string; resultValue: string; rateLabel: string; rateValue: string }[];
}

function emptyResponse(rangeDays: number): RootDashboardResponse {
  return {
    rangeDays,
    kpis: { totalLeads: 0, totalReach: 0, metaActiveCampaigns: 0, metaSpendCents: 0, socialFollowers: null, socialEngagement: null },
    funnel: [{ stage: "Reach", value: 0 }, { stage: "Clicks", value: 0 }, { stage: "Leads", value: 0 }],
    leadsBySource: [],
    reachTrend: [],
    moduleTrends: {
      meta: { headline: "$0", headlineLabel: "Ad spend", secondary: "0 active campaigns", data: [] },
      social: { headline: "—", headlineLabel: "Followers", secondary: "— engagement", data: [] },
    },
    channelTable: [],
  };
}

function dayRange(days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

function countByDay(dates: (string | null)[], days: string[]): { date: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const d of dates) {
    if (!d) continue;
    counts.set(d.slice(0, 10), (counts.get(d.slice(0, 10)) || 0) + 1);
  }
  return days.map((date) => ({ date, value: counts.get(date) || 0 }));
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** The root Dashboard's one call — a cross-module executive summary, each
 * module's own tab is the deep dive. Two things are combined for real
 * (both sides are literally the same kind of thing): "Total Leads" (a new
 * lead record entering the system, inbound from Meta) and "Total Reach" (impressions, whether from a Meta ad
 * or a social post) — Ad Spend/Reply Rate/Followers have no comparable
 * counterpart elsewhere so they stay per-module. `?range=` (7d/14d/30d/90d,
 * default 30d; "all" is a generous 180-day cap, not a genuine earliest-row
 * lookup across five different tables) rescopes every day-level series —
 * the funnel, both trend charts, and the module sparklines. Current-state
 * numbers (active campaigns, followers, reply rate) aren't day-level data
 * to begin with, so they stay as their own live snapshot regardless of range. */
export async function GET(request: NextRequest) {
  const rangeParam = (request.nextUrl.searchParams.get("range") || "30d") as RootDashboardRange;
  const rangeDays = RANGE_DAYS[rangeParam] ?? RANGE_DAYS["30d"];

  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const businessId = await MetaAdsService.getFirstBusinessId(supabase);
    if (!businessId) return NextResponse.json(emptyResponse(rangeDays));

    const since = new Date(Date.now() - rangeDays * 86_400_000).toISOString();
    const sinceDate = since.slice(0, 10);
    const days = dayRange(rangeDays);
    // Meta Ads temporarily hidden (src/config/features.ts): treat its data as absent.
    const metaOn = FEATURES.metaAds;

    const [
      { count: metaActiveCampaigns },
      { data: spendRows },
      { count: metaLeadsAllTime },
      { data: metaLeadRows },
      { data: connectionRows },
    ] = await Promise.all([
      supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "active"),
      supabase.from("ad_performance_daily").select("metric_date, spend_cents, impressions, clicks").eq("business_id", businessId).gte("metric_date", sinceDate),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("leads").select("created_at").eq("business_id", businessId).gte("created_at", since),
      supabase.from("platform_connections").select("platform, status").eq("business_id", businessId),
    ]);

    // Meta — spend/impressions/clicks in range, day by day.
    const metaSpendCents = (metaOn ? spendRows || [] : []).reduce((s, r) => s + (r.spend_cents || 0), 0);
    const metaClicks = (metaOn ? spendRows || [] : []).reduce((s, r) => s + (r.clicks || 0), 0);
    const metaImpressions = (metaOn ? spendRows || [] : []).reduce((s, r) => s + (r.impressions || 0), 0);
    const spendByDay = new Map<string, number>();
    const impressionsByDay = new Map<string, number>();
    for (const r of spendRows || []) {
      spendByDay.set(r.metric_date, (spendByDay.get(r.metric_date) || 0) + (r.spend_cents || 0));
      impressionsByDay.set(r.metric_date, (impressionsByDay.get(r.metric_date) || 0) + (r.impressions || 0));
    }
    const metaSpendTrend = days.map((date) => ({ date, value: spendByDay.get(date) || 0 }));
    const metaImpressionsTrend = days.map((date) => impressionsByDay.get(date) || 0);

    // Leads by source — real DB rows in range.
    const metaLeadsByDay = countByDay((metaOn ? metaLeadRows || [] : []).map((r) => r.created_at), days);
    const leadsBySource = days.map((date, i) => ({ date, meta: metaLeadsByDay[i].value }));
    const metaLeadsInRange = metaLeadsByDay.reduce((s, d) => s + d.value, 0);
    const totalLeads = metaLeadsInRange;

    // Social — connection status always live; analytics also called live
    // (no cache) on every load, best-effort beyond that.
    const statusByPlatform = new Map<string, string>();
    for (const c of connectionRows || []) statusByPlatform.set(c.platform, c.status);
    const connectedPlatforms = SUPPORTED_UPLOAD_POST_PLATFORMS.filter((p) => statusByPlatform.get(p) === "connected");

    let socialFollowers: number | null = null;
    let socialEngagement: number | null = null;
    let socialImpressionsInRange = 0;
    let socialTrend = days.map((date) => ({ date, value: 0 }));
    const username = env.UPLOAD_POST_PROFILE;
    if (username && connectedPlatforms.length > 0) {
      const periodByRange: Record<RootDashboardRange, string> = { "7d": "last_week", "14d": "last_week", "30d": "last_month", "90d": "last_3months", all: "last_3months" };
      // Live Upload-Post calls, every load — no cache/background job behind this.
      const [profileAnalytics, totalImpressions] = await Promise.all([
        UploadPostService.getProfileAnalytics(username, connectedPlatforms).catch(() => ({} as Record<string, UploadPostProfileAnalytics>)),
        UploadPostService.getTotalImpressions(username, { period: periodByRange[rangeParam] ?? "last_month", breakdown: true }).catch(() => null),
      ]);
      let followers = 0;
      let engagement = 0;
      let hasAnalytics = false;
      for (const platform of connectedPlatforms) {
        const a = profileAnalytics[platform];
        if (!a) continue;
        hasAnalytics = true;
        followers += a.followers || 0;
        engagement += (a.likes || 0) + (a.comments || 0) + (a.shares || 0) + (a.saves || 0);
      }
      socialFollowers = hasAnalytics ? followers : null;
      socialEngagement = hasAnalytics ? engagement : null;
      if (totalImpressions?.per_day) {
        socialTrend = days.map((date) => ({ date, value: totalImpressions.per_day![date] || 0 }));
        socialImpressionsInRange = socialTrend.reduce((s, d) => s + d.value, 0);
      }
    }

    const totalReach = metaImpressions + socialImpressionsInRange;
    const reachTrend = days.map((date, i) => ({ date, meta: metaImpressionsTrend[i], social: socialTrend[i]?.value || 0 }));

    const response: RootDashboardResponse = {
      rangeDays,
      kpis: {
        totalLeads,
        totalReach,
        metaActiveCampaigns: metaOn ? metaActiveCampaigns || 0 : 0,
        metaSpendCents,
        socialFollowers,
        socialEngagement,
      },
      funnel: [
        { stage: "Reach", value: totalReach },
        ...(metaOn ? [{ stage: "Clicks", value: metaClicks }] : []),
        { stage: "Leads", value: totalLeads },
      ],
      leadsBySource,
      reachTrend,
      moduleTrends: {
        meta: { headline: fmtCents(metaSpendCents), headlineLabel: "Ad spend", secondary: `${metaActiveCampaigns || 0} active campaigns`, data: metaSpendTrend },
        social: {
          headline: socialFollowers !== null ? socialFollowers.toLocaleString() : "—",
          headlineLabel: "Followers",
          secondary: socialEngagement !== null ? `${socialEngagement.toLocaleString()} engagement` : "No data yet",
          data: socialTrend,
        },
      },
      channelTable: [
        ...(!metaOn ? [] : [{ channel: "Meta Ads", primaryLabel: "Spend", primaryValue: fmtCents(metaSpendCents), resultLabel: "Leads", resultValue: metaLeadsInRange.toLocaleString(), rateLabel: "All-time leads", rateValue: (metaLeadsAllTime || 0).toLocaleString() }]),
        { channel: "Social", primaryLabel: "Impressions", primaryValue: socialImpressionsInRange.toLocaleString(), resultLabel: "Engagement", resultValue: socialEngagement !== null ? socialEngagement.toLocaleString() : "—", rateLabel: "Followers", rateValue: socialFollowers !== null ? socialFollowers.toLocaleString() : "—" },
      ],
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[ROOT_DASHBOARD]", error);
    return NextResponse.json({ error: error.message || "Failed to load dashboard" }, { status: 500 });
  }
}
