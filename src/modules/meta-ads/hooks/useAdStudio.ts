import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StudioAnswer, StudioAspectRatio, StudioMessage, StudioSession } from "../types/studio.types";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const studioKeys = {
  all: ["ad-studio"] as const,
  session: (id: string) => [...studioKeys.all, "session", id] as const,
};

export interface CreateStudioSessionInput {
  service?: string;
  initialIdea: string;
  aspectRatio: StudioAspectRatio;
  referenceImageUrl?: string;
}

export function useCreateStudioSession() {
  return useMutation({
    mutationFn: (input: CreateStudioSessionInput) =>
      fetchJson<{ session: StudioSession }>("/api/meta-ads/studio/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
  });
}

// While a generation/edit job is running, poll every few seconds so the
// image shows up as soon as the background job finishes — same "explicit
// user action, own loading state" category as the rest of the app's
// synchronous-feeling actions, not a passive page load.
/** The image currently shown in Ad Library for this session's creative —
 * null once nothing has been finalized yet. Lets the thread mark which
 * image message is "currently in library" and which still need a Finalize
 * button. */
export interface StudioSessionCreative {
  media_urls: string[] | null;
  status: string;
}

export function useStudioSession(sessionId: string | null) {
  return useQuery({
    queryKey: studioKeys.session(sessionId || ""),
    queryFn: () =>
      fetchJson<{ session: StudioSession; messages: StudioMessage[]; creative: StudioSessionCreative | null }>(
        `/api/meta-ads/studio/sessions/${sessionId}`
      ),
    enabled: !!sessionId,
    refetchInterval: (query) => (query.state.data?.session.status === "generating" ? 4000 : false),
  });
}

export function useSubmitStudioAnswers(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (answers: StudioAnswer[]) =>
      fetchJson<{ session: StudioSession }>(`/api/meta-ads/studio/sessions/${sessionId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: studioKeys.session(sessionId) }),
  });
}

export function useRequestStudioEdit(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (instruction: string) =>
      fetchJson<{ session: StudioSession }>(`/api/meta-ads/studio/sessions/${sessionId}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: studioKeys.session(sessionId) }),
  });
}

export function useFinalizeStudioSession(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (imageUrl: string) =>
      fetchJson<{ creativeId: string }>(`/api/meta-ads/studio/sessions/${sessionId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: studioKeys.session(sessionId) }),
  });
}
