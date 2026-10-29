import { useQuery } from "@tanstack/react-query";

export type MetaAdsDashboardRange = "7d" | "14d" | "30d" | "90d" | "all";

export interface MetaAdsDashboardData {
  rangeDays: number;
  kpis: {
    spendCents: number;
    avgCtr: number;
    adsTracked: number;
  };
  spendTrend: { date: string; spendCents: number }[];
  scoreBuckets: {
    label: "Excellent" | "Good" | "Average" | "Needs Work" | "Critical";
    count: number;
    ads: {
      metaAdId: string;
      ctr: number;
      spendCents: number;
      clicks: number;
      impressions: number;
      daysRunning: number;
      adText: string | null;
      mediaUrl: string | null;
      link: { campaignId: string; adSetId: string; adId: string } | null;
    }[];
  }[];
}

async function fetchDashboard(range: MetaAdsDashboardRange): Promise<MetaAdsDashboardData> {
  const res = await fetch(`/api/meta-ads/dashboard?range=${range}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load dashboard");
  return data;
}

/** The one call the Meta Ads Dashboard tab makes — spend trend and self-ad
 * score distribution, in one narrow response. Always fresh, never reused from cache
 * (gcTime 0 — a stale-but-cached result surviving an unmount is exactly
 * what caused a hydration mismatch on revisit: server always SSRs the
 * loading state, but a warm client cache would otherwise skip straight to
 * the loaded one on remount).
 * `range` only rescopes the spend/CTR KPIs and the spend trend chart —
 * see the API route's own doc comment for why the rest of the page doesn't
 * have a meaningful "last N days" version. */
export function useMetaAdsDashboard(range: MetaAdsDashboardRange) {
  return useQuery({
    queryKey: ["meta-ads", "dashboard", range],
    queryFn: () => fetchDashboard(range),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}
