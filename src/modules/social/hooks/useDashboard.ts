import { useQuery } from "@tanstack/react-query";

export interface SocialDashboardData {
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
  platformHealth: { platform: string; status: string }[];
  audienceDemographics: { age: Record<string, number>; gender: Record<string, number> } | null;
}

async function fetchDashboard(): Promise<SocialDashboardData> {
  const res = await fetch("/api/social/dashboard");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load dashboard");
  return data;
}

/** The one call the Social Dashboard tab makes — real, live Upload-Post
 * account analytics (followers/reach/impressions/engagement, impressions
 * and follower comparison per platform, engagement-type breakdown) for
 * every connected account, plus connection health. Always fresh — gcTime 0
 * so a warm client cache never skips the loading state on remount (SSR
 * always renders it loading; a cached client hit there is a hydration
 * mismatch). */
export function useSocialDashboard() {
  return useQuery({
    queryKey: ["social", "dashboard"],
    queryFn: fetchDashboard,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}
