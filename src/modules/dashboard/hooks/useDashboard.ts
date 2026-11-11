import { useQuery } from "@tanstack/react-query";

export type RootDashboardRange = "7d" | "14d" | "30d" | "90d" | "all";

export interface RootDashboardData {
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

async function fetchDashboard(range: RootDashboardRange): Promise<RootDashboardData> {
  const res = await fetch(`/api/dashboard?range=${range}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load dashboard");
  return data;
}

/** The one call the root Dashboard makes — a Social summary, always fresh.
 * `range` rescopes every day-level series — see the API route's own doc
 * comment for which KPIs are live snapshots instead and don't change with it. gcTime 0 so a warm
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
