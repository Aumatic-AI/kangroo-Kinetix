import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type { ActivityResponse, AutomationSettings, ContentDetail, GalleryResponse } from "../types/content.types";

export const contentKeys = {
  all: ["content"] as const,
  gallery: (f: GalleryFilters) => [...contentKeys.all, "gallery", f] as const,
  detail: (id: string) => [...contentKeys.all, "detail", id] as const,
  activity: [...["content"], "activity"] as const,
  settings: [...["content"], "settings"] as const,
};

export interface GalleryFilters { page: number; limit: number; type?: string; pipeline?: string; status?: string }

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

const POLL_MS = 5000;

export function useGallery(filters: GalleryFilters) {
  const params = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit) });
  if (filters.type) params.set("type", filters.type);
  if (filters.pipeline) params.set("pipeline", filters.pipeline);
  if (filters.status) params.set("status", filters.status);
  return useQuery({
    queryKey: contentKeys.gallery(filters),
    queryFn: () => fetchJson<GalleryResponse>(`/api/content/gallery?${params.toString()}`),
    placeholderData: keepPreviousData,
    // Cards fill in as generation finishes — poll only while something is still in flight.
    refetchInterval: (q) => (q.state.data?.items.some((i) => i.generationStatus === "processing" || i.generationStatus === "pending" || i.regenerating) ? POLL_MS : false),
  });
}

export function useContentDetail(id: string | null) {
  return useQuery({
    queryKey: contentKeys.detail(id ?? ""),
    queryFn: () => fetchJson<ContentDetail>(`/api/content/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.item.generationStatus === "processing" || q.state.data?.item.regenerating ? POLL_MS : false),
  });
}

export function useActivity() {
  return useQuery({
    queryKey: contentKeys.activity,
    queryFn: () => fetchJson<ActivityResponse>("/api/content/activity"),
    refetchInterval: (q) => (q.state.data?.jobs.some((j) => j.status === "pending" || j.status === "processing") ? POLL_MS : 30_000),
  });
}

export function useAutomationSettings() {
  return useQuery({
    queryKey: contentKeys.settings,
    queryFn: async () => (await fetchJson<{ settings: AutomationSettings }>("/api/content/settings")).settings,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<AutomationSettings, "socialFrequency" | "linkedinFrequency" | "blogFrequency" | "isEnabled">>) =>
      (await fetchJson<{ settings: AutomationSettings }>("/api/content/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      })).settings,
    onSuccess: (settings) => qc.setQueryData(contentKeys.settings, settings),
  });
}

/** TEMPORARY manual trigger — generates into the gallery only; nothing is published. */
export function useTriggerGeneration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (counts: { social: number; linkedin: number; blog?: number }) =>
      fetchJson<{ success: true; cycleId: string }>("/api/content/trigger", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(counts),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: contentKeys.all }),
  });
}

export function useDeleteContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson<{ success: true }>(`/api/content/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: contentKeys.all }),
  });
}

export function useRegenerate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contentId, prompt }: { contentId: string; prompt?: string }) =>
      fetchJson<{ success: true; revisionId: string }>("/api/content/regenerate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentId, prompt }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: contentKeys.all }),
  });
}
