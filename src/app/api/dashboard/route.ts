import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { getFirstBusinessId } from "@/lib/business";
import { env } from "@/config/env";
import { UploadPostService, SUPPORTED_UPLOAD_POST_PLATFORMS, type UploadPostProfileAnalytics } from "@/services/upload-post";

export const dynamic = "force-dynamic";

const RANGE_DAYS = { "7d": 7, "14d": 14, "30d": 30, "90d": 90, all: 180 } as const;
export type RootDashboardRange = keyof typeof RANGE_DAYS;

interface RootDashboardResponse {
  rangeDays: number;
  kpis: {
    totalReach: number;
    socialFollowers: number | null;
    socialEngagement: number | null;
  };
  reachTrend: { date: string; social: number }[];
  moduleTrends: {
    social: { headline: string; headlineLabel: string; secondary: string; data: { date: string; value: number }[] };
  };
}

function emptyResponse(rangeDays: number): RootDashboardResponse {
  return {
    rangeDays,
    kpis: { totalReach: 0, socialFollowers: null, socialEngagement: null },
    reachTrend: [],
    moduleTrends: {
      social: { headline: "—", headlineLabel: "Followers", secondary: "— engagement", data: [] },
    },
  };
}

function dayRange(days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

/** The root Dashboard's one call — a Social summary (reach, followers,
 * engagement), all fetched live from Upload-Post on every load. `?range=`
 * (7d/14d/30d/90d, default 30d; "all" is a generous 180-day cap) rescopes
 * the day-level series. Followers/engagement are live snapshots and don't
 * change with the range. */
export async function GET(request: NextRequest) {
  const rangeParam = (request.nextUrl.searchParams.get("range") || "30d") as RootDashboardRange;
  const rangeDays = RANGE_DAYS[rangeParam] ?? RANGE_DAYS["30d"];

  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const businessId = await getFirstBusinessId(supabase);
    if (!businessId) return NextResponse.json(emptyResponse(rangeDays));

    const days = dayRange(rangeDays);

    const { data: connectionRows } = await supabase.from("platform_connections").select("platform, status").eq("business_id", businessId);

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

    const totalReach = socialImpressionsInRange;
    const reachTrend = days.map((date, i) => ({ date, social: socialTrend[i]?.value || 0 }));

    const response: RootDashboardResponse = {
      rangeDays,
      kpis: { totalReach, socialFollowers, socialEngagement },
      reachTrend,
      moduleTrends: {
        social: {
          headline: socialFollowers !== null ? socialFollowers.toLocaleString() : "—",
          headlineLabel: "Followers",
          secondary: socialEngagement !== null ? `${socialEngagement.toLocaleString()} engagement` : "No data yet",
          data: socialTrend,
        },
      },
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[ROOT_DASHBOARD]", error);
    return NextResponse.json({ error: error.message || "Failed to load dashboard" }, { status: 500 });
  }
}
