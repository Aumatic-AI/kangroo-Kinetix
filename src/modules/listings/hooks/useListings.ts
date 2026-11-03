import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type { ListingDetail, ListingFilters, ListingStatus, ListingsResponse } from "../types/listings.types";

export const listingKeys = {
  all: ["listings"] as const,
  list: (filters: ListingFilters) => [...listingKeys.all, "list", filters] as const,
  detail: (id: string) => [...listingKeys.all, "detail", id] as const,
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export function useListings(filters: ListingFilters) {
  const params = new URLSearchParams({ page: String(filters.page ?? 1), limit: String(filters.limit ?? 10) });
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.category) params.set("category", filters.category);
  return useQuery({
    queryKey: listingKeys.list(filters),
    queryFn: () => fetchJson<ListingsResponse>(`/api/listings?${params.toString()}`),
    // Keep the old page on screen while the next one loads — no flash on paging/filtering.
    placeholderData: keepPreviousData,
  });
}

export function useListing(id: string | null) {
  return useQuery({
    queryKey: listingKeys.detail(id ?? ""),
    queryFn: () => fetchJson<ListingDetail>(`/api/listings/${id}`),
    enabled: !!id,
  });
}

export function useSetListingStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ListingStatus }) =>
      fetchJson<{ success: true; id: string; status: ListingStatus }>(`/api/listings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listingKeys.all }),
  });
}
