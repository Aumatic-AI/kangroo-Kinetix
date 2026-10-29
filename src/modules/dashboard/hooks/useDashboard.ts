import { useQuery } from "@tanstack/react-query";

export type RootDashboardRange = "7d" | "14d" | "30d" | "90d" | "all";

export interface RootDashboardData {
  rangeDays: number;
  kpis: {
    totalLeads: number;
    totalReach: number;
    metaActiveCampaigns: number;
    metaSpendCents: number;
    outreachReplyRate: number;
    outreachSendingNow: number;
    socialFollowers: number | null;
    socialEngagement: number | null;
  };
  funnel: { stage: string; value: number }[];
  leadsBySource: { date: string; meta: number; outreach: number }[];
  reachTrend: { date: string; meta: number; social: number }[];
  moduleTrends: {
    meta: { headline: string; headlineLabel: string; secondary: string; data: { date: string; value: number }[] };
    outreach: { headline: string; headlineLabel: string; secondary: string; data: { date: string; value: number }[] };
    social: { headline: string; headlineLabel: string; secondary: string; data: { date: string; value: number }[] };
  };
  channelTable: { channel: string; primaryLabel: string; primaryValue: string; resultLabel: string; resultValue: string; rateLabel: string; rateValue: string }[];
}

async function fetchDashboard(range: RootDashboardRange): Promise<RootDashboardData> {
  const res = await fetch(`/api/dashboard?range=${range}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load dashboard");
  return data;
}

/** The one call the root Dashboard makes — a cross-module executive
 * summary, always fresh. Each module's own Dashboard tab is the deep dive.
 * `range` rescopes every day-level series (funnel, both trend charts, the
 * module sparklines) — see the API route's own doc comment for which KPIs
 * are live snapshots instead and don't change with it. gcTime 0 so a warm
 * client cache never skips the loading state on remount (SSR always
 * renders it loading, so a cached hit there is a hydration mismatch). */
export function useRootDashboard(range: RootDashboardRange) {
  return useQuery({
    queryKey: ["root-dashboard", range],
    queryFn: () => fetchDashboard(range),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}
