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

/** Uploads the male or female video-reference photo — a plain multipart
 * POST (not JSON), separate from the rest of Settings' single Save bar
 * since it's a real file upload, not a form-field edit. */
export function useUploadVideoReference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ gender, file }: { gender: "male" | "female"; file: File }) => {
      const formData = new FormData();
      formData.append("gender", gender);
      formData.append("file", file);
      return fetchJson<{ success: true; url: string }>("/api/settings/video-reference", { method: "POST", body: formData });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
  });
}

/** Uploads the business logo — same upload-on-pick pattern as the video
 * reference photos above. */
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
