import { useQuery } from "@tanstack/react-query";

export interface OutreachDashboardData {
  kpis: {
    totalLeads: number;
    activeCampaigns: number;
    totalSent: number;
    openRate: number;
    replyRate: number;
    bounceRate: number;
  };
  campaignBreakdown: { name: string; sent: number; opened: number; replied: number }[];
  leadStatusBreakdown: { status: string; count: number }[];
  sendsTrend: { date: string; count: number }[];
}

async function fetchDashboard(): Promise<OutreachDashboardData> {
  const res = await fetch("/api/outreach/dashboard");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load dashboard");
  return data;
}

/** The one call the Outreach Dashboard tab makes — live delivery KPIs plus
 * campaign/lead-status/send-volume breakdowns, always fresh. gcTime 0 so a
 * warm client cache never skips the loading state on remount — SSR always
 * renders it loading, so a cached client hit there would be a hydration
 * mismatch. */
export function useOutreachDashboard() {
  return useQuery({
    queryKey: ["outreach", "dashboard"],
    queryFn: fetchDashboard,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}
