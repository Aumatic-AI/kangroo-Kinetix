import { useQuery } from "@tanstack/react-query";
import type { DashboardData, DashboardRange } from "../types";

async function fetchDashboard(range: DashboardRange): Promise<DashboardData> {
  const res = await fetch(`/api/dashboard?range=${range}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load dashboard");
  return data;
}

/** The Dashboard's one call: live social analytics + content-automation status.
 * Always fresh — gcTime 0 so a warm client cache never skips the loading state
 * on remount (SSR always renders it loading; a cached hit there is a hydration
 * mismatch). */
export function useDashboard(range: DashboardRange) {
  return useQuery({
    queryKey: ["dashboard", range],
    queryFn: () => fetchDashboard(range),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}
