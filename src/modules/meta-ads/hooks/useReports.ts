import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { PaginationMeta } from "@/lib/pagination";

export interface ReportAd {
  adId: string;
  adName: string;
  campaignId: string;
  campaignName: string;
  status: string;
  thumbnailUrl?: string;
  headline: string | null;
  body: string | null;
  cta: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  reach: number;
  score: number;
  scoreLabel: string;
}

export interface ReportSummary {
  totalAds: number;
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  avgCtr: number;
  avgCpm: number;
  scoreMethodology: string;
}

export type ReportRange = "today" | "7d" | "14d" | "30d" | "all" | "custom";

/** Always live from Meta for whatever range is selected — see the build
 * guide's "Reports" section for why this never touches the nightly
 * ad_performance_daily snapshot table. staleTime keeps repeat visits to the
 * same range from re-hitting the Graph API every render. Pagination is a
 * post-fetch slice server-side (no DB table backs this list — see the API
 * route), but `summary` always reflects the full range regardless of page. */
export function useReportsData(range: ReportRange, page: number, limit: number, customStart?: string, customEnd?: string) {
  return useQuery({
    queryKey: ["reports", range, page, limit, customStart, customEnd],
    queryFn: async () => {
      const params = new URLSearchParams({ range, page: String(page), limit: String(limit) });
      if (range === "custom" && customStart && customEnd) {
        params.set("start", customStart);
        params.set("end", customEnd);
      }
      const res = await fetch(`/api/meta-ads/reports?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load reports");
      return data as { ads: ReportAd[]; summary: ReportSummary } & PaginationMeta;
    },
    enabled: range !== "custom" || (!!customStart && !!customEnd),
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
