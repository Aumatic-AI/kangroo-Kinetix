import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { MetaAdsService } from "@/modules/meta-ads/services/meta-ads.service";
import { env } from "@/config/env";
import { UploadPostService, SUPPORTED_UPLOAD_POST_PLATFORMS, type UploadPostPlatform, type UploadPostProfileAnalytics } from "@/services/upload-post";

export const dynamic = "force-dynamic";

interface SocialDashboardResponse {
  kpis: {
    totalFollowers: number | null;
    totalImpressions: number | null;
    totalEngagement: number | null;
    totalReach: number | null;
    connectedAccounts: number;
  };
  impressionsTrend: { date: string; impressions: number }[];
  impressionsByPlatform: { platform: string; impressions: number }[];
  platformComparison: { platform: string; followers: number; reach: number; engagement: number }[];
  engagementBreakdown: { type: string; value: number }[];
  platformHealth: { platform: UploadPostPlatform; status: string }[];
  audienceDemographics: { age: Record<string, number>; gender: Record<string, number> } | null;
}

const EMPTY: SocialDashboardResponse = {
  kpis: { totalFollowers: null, totalImpressions: null, totalEngagement: null, totalReach: null, connectedAccounts: 0 },
  impressionsTrend: [],
  impressionsByPlatform: [],
  platformComparison: [],
  engagementBreakdown: [],
  platformHealth: SUPPORTED_UPLOAD_POST_PLATFORMS.map((platform) => ({ platform, status: "not_connected" })),
  audienceDemographics: null,
};

function engagementOf(m: { likes?: number; comments?: number; shares?: number; saves?: number }): number {
  return (m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0);
}

/** Everything the Social dashboard renders, in one call — real Upload-Post
 * account analytics for every connected platform, plus which platforms are
 * actually connected right now. Calls Upload-Post live on every load (no
 * background cache job) — accepted deliberately in exchange for never
 * showing stale numbers; Upload-Post's own analytics endpoints can take
 * several seconds. Deliberately built only from the two live calls that
 * reliably return data (profile analytics, total impressions) — the
 * cached-post-analytics endpoint (per-post engagement, "top posts")
 * consistently comes back empty for this account (likely needs time to
 * accumulate snapshots on Upload-Post's side), so nothing here depends on it. */
export async function GET() {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const businessId = await MetaAdsService.getFirstBusinessId(supabase);
    if (!businessId) return NextResponse.json(EMPTY);

    const { data: connectionRows } = await supabase.from("platform_connections").select("platform, status").eq("business_id", businessId);

    const statusByPlatform = new Map<string, string>();
    for (const c of connectionRows || []) statusByPlatform.set(c.platform, c.status);
    const platformHealth: SocialDashboardResponse["platformHealth"] = SUPPORTED_UPLOAD_POST_PLATFORMS.map((platform) => ({
      platform,
      status: statusByPlatform.get(platform) || "not_connected",
    }));
    const connectedPlatforms = platformHealth.filter((p) => p.status === "connected").map((p) => p.platform);
    const connectedAccounts = connectedPlatforms.length;

    const response: SocialDashboardResponse = { ...EMPTY, kpis: { ...EMPTY.kpis, connectedAccounts }, platformHealth };

    const username = env.UPLOAD_POST_PROFILE;
    if (!username || connectedPlatforms.length === 0) {
      return NextResponse.json(response);
    }

    // Live Upload-Post calls, every load — no cache, see the route's own comment.
    const [profileAnalytics, totalImpressions] = await Promise.all([
      UploadPostService.getProfileAnalytics(username, connectedPlatforms).catch(() => ({} as Record<string, UploadPostProfileAnalytics>)),
      UploadPostService.getTotalImpressions(username, { period: "last_month", breakdown: true }).catch(() => null),
    ]);

    // KPIs — real totals across every connected platform.
    let totalFollowers = 0;
    let totalEngagement = 0;
    let totalReach = 0;
    let hasAnalytics = false;
    const engagementTotals = { likes: 0, comments: 0, shares: 0, saves: 0 };
    for (const platform of connectedPlatforms) {
      const a = profileAnalytics[platform];
      if (!a) continue;
      hasAnalytics = true;
      totalFollowers += a.followers || 0;
      totalEngagement += engagementOf(a);
      totalReach += a.reach ?? a.impressions ?? 0;
      engagementTotals.likes += a.likes || 0;
      engagementTotals.comments += a.comments || 0;
      engagementTotals.shares += a.shares || 0;
      engagementTotals.saves += a.saves || 0;
    }
    response.kpis.totalFollowers = hasAnalytics ? totalFollowers : null;
    response.kpis.totalEngagement = hasAnalytics ? totalEngagement : null;
    response.kpis.totalReach = hasAnalytics ? totalReach : null;
    response.kpis.totalImpressions = totalImpressions?.total_impressions ?? null;

    // What kind of engagement is it — likes vs. comments vs. shares vs.
    // saves. Same real numbers already summed into the Engagement KPI,
    // just broken back out into its parts.
    response.engagementBreakdown = (["likes", "comments", "shares", "saves"] as const)
      .map((type) => ({ type, value: engagementTotals[type] }))
      .filter((e) => e.value > 0);

    // Impressions trend — real daily total impressions, zero-filled.
    if (totalImpressions?.per_day) {
      response.impressionsTrend = Object.entries(totalImpressions.per_day)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, impressions]) => ({ date, impressions }));
    }

    // Impressions by platform — same total-impressions call, its per-platform
    // breakdown, not a separate fetch.
    if (totalImpressions?.per_platform) {
      response.impressionsByPlatform = Object.entries(totalImpressions.per_platform)
        .map(([platform, impressions]) => ({ platform, impressions }))
        .sort((a, b) => b.impressions - a.impressions);
    }

    // Platform comparison — plain per-platform numbers, no normalization
    // needed since the UI shows one proportional bar (followers) plus the
    // other two metrics as plain text, not a shared-axis chart.
    for (const platform of connectedPlatforms) {
      const a = profileAnalytics[platform];
      if (!a) continue;
      response.platformComparison.push({ platform, followers: a.followers || 0, reach: a.reach ?? a.impressions ?? 0, engagement: engagementOf(a) });
    }

    // Audience demographics — Instagram only, and only once it has enough
    // followers for Meta to actually populate this (see Upload-Post docs).
    const igDemo = profileAnalytics["instagram"]?.follower_demographics;
    if (igDemo?.age && Object.keys(igDemo.age).length > 0 && igDemo.gender && Object.keys(igDemo.gender).length > 0) {
      response.audienceDemographics = { age: igDemo.age, gender: igDemo.gender };
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[SOCIAL_DASHBOARD]", error);
    return NextResponse.json({ error: error.message || "Failed to load dashboard" }, { status: 500 });
  }
}
