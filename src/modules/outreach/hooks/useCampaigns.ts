import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { OutreachCampaign, OutreachCampaignListItem, OutreachCampaignDetail, CreateOutreachCampaignInput, OutreachAnalyticsResponse, OutreachCampaignSendPreview } from "../types/outreach.types";
import { PaginationMeta } from "@/lib/pagination";

export const outreachKeys = {
  all: ["outreach"] as const,
  campaignsAll: () => [...outreachKeys.all, "campaigns"] as const,
  campaigns: (page: number, limit: number) => [...outreachKeys.campaignsAll(), page, limit] as const,
  campaign: (id: string) => [...outreachKeys.all, "campaigns", id] as const,
  analytics: () => [...outreachKeys.all, "analytics"] as const,
  sendPreview: (id: string) => [...outreachKeys.all, "send-preview", id] as const,
};

/** The unified status shown everywhere (list, detail, dashboard) is
 * computed inside the analytics response, not the plain campaign row — any
 * mutation that changes a campaign's delivery state must invalidate this
 * too, or the badge/KPIs keep showing whatever was cached before the action. */
function invalidateCampaignState(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  queryClient.invalidateQueries({ queryKey: outreachKeys.campaignsAll() });
  queryClient.invalidateQueries({ queryKey: outreachKeys.campaign(id) });
  queryClient.invalidateQueries({ queryKey: outreachKeys.analytics() });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export function useOutreachCampaigns(page: number, limit: number) {
  return useQuery({
    queryKey: outreachKeys.campaigns(page, limit),
    queryFn: () => fetchJson<{ campaigns: OutreachCampaignListItem[] } & PaginationMeta>(`/api/outreach/campaigns?page=${page}&limit=${limit}`),
    // Fresh on every mount/reload/mutation-invalidation (staleTime 0), but
    // NOT on every window/tab focus — with the default refetchOnWindowFocus,
    // staleTime 0 means switching tabs and back re-fetches every single time,
    // which is the noisy behavior we don't want.
    staleTime: 0,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });
}

/** `pollUntil` — the Send action returns as soon as the background job is
 * queued, not once it's actually done (Instantly campaign creation +
 * activation genuinely takes a few seconds) — pass a deadline timestamp
 * right after a successful Send so the status badge catches up on its own
 * instead of looking unchanged until the page is manually reloaded. Stops
 * as soon as the query's own last-fetched status moves off "ready" (the job
 * caught up) or once the deadline passes, whichever comes first — evaluated
 * from the query's own state, not external component state, so there's
 * nothing to keep in sync by hand. */
export function useOutreachCampaign(id: string | null, pollUntil: number | null = null) {
  return useQuery({
    queryKey: outreachKeys.campaign(id || ""),
    queryFn: () => fetchJson<{ campaign: OutreachCampaignDetail }>(`/api/outreach/campaigns/${id}`).then((d) => d.campaign),
    enabled: !!id,
    refetchInterval: (query) => {
      if (!pollUntil || Date.now() >= pollUntil) return false;
      return query.state.data?.status === "ready" ? 3000 : false;
    },
  });
}

export function useCreateOutreachCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOutreachCampaignInput) =>
      fetchJson<{ campaign: OutreachCampaign }>("/api/outreach/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: outreachKeys.campaignsAll() });
      queryClient.invalidateQueries({ queryKey: outreachKeys.analytics() });
    },
  });
}

export function useRegenerateOutreachCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ campaignId, feedback }: { campaignId: string; feedback: string }) =>
      fetchJson(`/api/outreach/campaigns/${campaignId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback }) }),
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: outreachKeys.campaign(variables.campaignId) }),
  });
}

export function useEditOutreachCampaignContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ campaignId, subject, body }: { campaignId: string; subject: string; body: string }) =>
      fetchJson(`/api/outreach/campaigns/${campaignId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manualEdit: { subject, body } }) }),
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: outreachKeys.campaign(variables.campaignId) }),
  });
}

export function useApproveOutreachCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson(`/api/outreach/campaigns/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approve: true }) }),
    onSuccess: (_data, id) => invalidateCampaignState(queryClient, id),
  });
}

export function useSendOutreachCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, listId }: { id: string; listId?: string }) =>
      fetchJson(`/api/outreach/campaigns/${id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listId }) }),
    onSuccess: (_data, variables) => invalidateCampaignState(queryClient, variables.id),
  });
}

export function usePauseOutreachCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson(`/api/outreach/campaigns/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pause: true }) }),
    onSuccess: (_data, id) => invalidateCampaignState(queryClient, id),
  });
}

export function useResumeOutreachCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson(`/api/outreach/campaigns/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resume: true }) }),
    onSuccess: (_data, id) => invalidateCampaignState(queryClient, id),
  });
}

export function useDeleteOutreachCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson(`/api/outreach/campaigns/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: outreachKeys.campaignsAll() });
      queryClient.invalidateQueries({ queryKey: outreachKeys.analytics() });
    },
  });
}

/** On-demand only — call while a Send confirmation is actually open (pass
 * `null` otherwise). Never fetched as part of a page's normal load. */
export function useCampaignSendPreview(campaignId: string | null) {
  return useQuery({
    queryKey: outreachKeys.sendPreview(campaignId || ""),
    queryFn: () => fetchJson<OutreachCampaignSendPreview>(`/api/outreach/campaigns/${campaignId}/send-preview`),
    enabled: !!campaignId,
  });
}

export function useOutreachAnalytics() {
  return useQuery({
    queryKey: outreachKeys.analytics(),
    queryFn: () => fetchJson<OutreachAnalyticsResponse>("/api/outreach/analytics"),
    // Fresh on every mount/reload/mutation-invalidation (staleTime 0) — this
    // is exactly the data most likely to have changed since the last view
    // (sends/opens/replies/health). But not on every window/tab focus: with
    // the default refetchOnWindowFocus, staleTime 0 means merely switching
    // tabs and back re-fetches every time, which is just noise.
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}
