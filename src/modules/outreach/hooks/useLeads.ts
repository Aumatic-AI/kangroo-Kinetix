import { useQuery, useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Lead, LeadSummary, LeadFilters, LeadListSummary, LeadCampaignHistoryEntry, MetaCampaignLeadBreakdown, MetaCampaignLead } from "../types/leads.types";
import { PaginationMeta } from "@/lib/pagination";

export const leadsKeys = {
  all: ["leads"] as const,
  list: (filters?: LeadFilters, page?: number) => [...leadsKeys.all, "list", filters, page] as const,
  infiniteList: (filters?: LeadFilters, limit?: number) => [...leadsKeys.all, "infinite-list", filters, limit] as const,
  lists: () => [...leadsKeys.all, "lists"] as const,
  history: (leadId: string) => [...leadsKeys.all, "history", leadId] as const,
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function buildLeadsParams(filters: LeadFilters | undefined, page: number, limit: number): URLSearchParams {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters?.listId) params.set("listId", filters.listId);
  if (filters?.listIds?.length) params.set("listIds", filters.listIds.join(","));
  if (filters?.search) params.set("search", filters.search);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.excludeStatuses?.length) params.set("excludeStatuses", filters.excludeStatuses.join(","));
  return params;
}

export function useLeads(filters?: LeadFilters, page = 1, limit = 50) {
  return useQuery({
    queryKey: leadsKeys.list(filters, page),
    queryFn: () => fetchJson<{ leads: LeadSummary[]; count: number }>(`/api/outreach/leads?${buildLeadsParams(filters, page, limit).toString()}`),
  });
}

/** Infinite-scroll pagination — fetches one page (default 30 leads) at a
 * time instead of the whole list up front. Call fetchNextPage() when the
 * scroll container nears its bottom; hasNextPage/isFetchingNextPage drive
 * the loading state. */
export function useInfiniteLeads(filters?: LeadFilters, limit = 30) {
  return useInfiniteQuery({
    queryKey: leadsKeys.infiniteList(filters, limit),
    queryFn: ({ pageParam }) => fetchJson<{ leads: LeadSummary[]; count: number }>(`/api/outreach/leads?${buildLeadsParams(filters, pageParam, limit).toString()}`),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const fetchedSoFar = allPages.reduce((sum, p) => sum + p.leads.length, 0);
      return fetchedSoFar < lastPage.count ? allPages.length + 1 : undefined;
    },
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; firstName?: string; lastName?: string; phone?: string; company?: string; listId?: string }) =>
      fetchJson<{ success: true; lead: Lead }>("/api/outreach/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadsKeys.all }),
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson(`/api/outreach/leads/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadsKeys.all }),
  });
}

export function useLeadCampaignHistory(leadId: string | null) {
  return useQuery({
    queryKey: leadsKeys.history(leadId || ""),
    queryFn: () => fetchJson<{ history: LeadCampaignHistoryEntry[] }>(`/api/outreach/leads/${leadId}/history`).then((d) => d.history),
    enabled: !!leadId,
  });
}

export interface LeadListWithCount extends LeadListSummary {
  leadCount: number;
}

/** The full list, unpaginated — for pickers/dropdowns that need every list
 * at once. For the Leads page's paginated table, use usePaginatedLeadLists
 * instead. Not currently used by any page (lists are shown via Meta
 * campaigns now — see useMetaCampaignBreakdown), kept since the underlying
 * outreach_lead_lists rows this reads are still real and still created by
 * MetaLeadsImportService. */
export function useLeadLists() {
  return useQuery({
    queryKey: leadsKeys.lists(),
    queryFn: () => fetchJson<{ lists: LeadListWithCount[] }>("/api/outreach/lists").then((d) => d.lists),
    staleTime: 60 * 1000,
  });
}

/** Same underlying route as useLeadLists, paginated. See that hook's own
 * comment — not currently used by any page. */
export function usePaginatedLeadLists(page: number, limit: number) {
  return useQuery({
    queryKey: [...leadsKeys.lists(), "paginated", page, limit] as const,
    queryFn: () => fetchJson<{ lists: LeadListWithCount[] } & PaginationMeta>(`/api/outreach/lists?page=${page}&limit=${limit}`),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

/** Live breakdown of Meta Ads campaigns with leads — the "list" concept
 * everywhere in Outreach now (New Campaign's picker, the Leads page's
 * table). Cheap to call on every visit (reads our own already-synced
 * `leads` table, no live Meta API call). */
export function useMetaCampaignBreakdown() {
  return useQuery({
    queryKey: ["outreach-meta-campaigns"] as const,
    queryFn: () => fetchJson<{ campaigns: MetaCampaignLeadBreakdown[] }>("/api/outreach/meta-campaigns").then((d) => d.campaigns),
  });
}

/** One Meta campaign's individual leads, live from Meta Ads' own `leads`
 * table (not outreach_leads — nothing needs to be imported just to browse
 * them) — backs the Leads page's "View" drawer. Infinite-scroll, same
 * shape as useInfiniteLeads. */
export function useInfiniteMetaCampaignLeads(campaignName: string | undefined, limit = 30) {
  return useInfiniteQuery({
    queryKey: ["outreach-meta-campaign-leads", campaignName, limit] as const,
    queryFn: ({ pageParam }) =>
      fetchJson<{ leads: MetaCampaignLead[]; count: number }>(
        `/api/outreach/meta-campaigns/leads?campaignName=${encodeURIComponent(campaignName || "")}&page=${pageParam}&limit=${limit}`
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const fetchedSoFar = allPages.reduce((sum, p) => sum + p.leads.length, 0);
      return fetchedSoFar < lastPage.count ? allPages.length + 1 : undefined;
    },
    enabled: !!campaignName,
  });
}
