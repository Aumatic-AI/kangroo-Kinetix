import { useQuery } from "@tanstack/react-query";
import { socialKeys, SocialConnection } from "./usePosts";

export interface ConnectedAccount extends SocialConnection {
  created_at: string;
}

/** Connected Accounts page — pulls every platform's live status (including
 * "not connected") from Upload-Post and upserts our own platform_connections
 * cache. This is a real account-status change, not something that happens
 * throughout the day, so it's cached for a while instead of re-fetching on
 * every visit to the page. */
export function useConnectedAccountsSync() {
  return useQuery({
    queryKey: [...socialKeys.all, "connected-accounts-sync"] as const,
    queryFn: async () => {
      const res = await fetch("/api/social/upload-post/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sync connection status");
      return (data.connections || []) as ConnectedAccount[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
