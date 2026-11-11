import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BusinessSettings } from "../types/settings.types";

const settingsKeys = { all: ["settings"] as const };

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: () => fetchJson<{ settings: BusinessSettings }>("/api/settings").then((d) => d.settings),
    staleTime: 30 * 1000,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BusinessSettings) =>
      fetchJson("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
  });
}

/** Uploads the business logo — upload-on-pick, a real file upload separate from the Save bar. */
export function useUploadLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return fetchJson<{ success: true; url: string }>("/api/settings/logo", { method: "POST", body: formData });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
  });
}
