import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { generationRefetchInterval } from "@/lib/generation-polling";

const supabase = createClient();

export const socialKeys = {
  all: ["social"] as const,
  posts: () => [...socialKeys.all, "posts"] as const,
};

const IN_PROGRESS_STATUSES = ["generating", "publishing"];

interface PostPollRow {
  status: string;
  format: string;
  created_at: string;
}

// "generating" uses the same warmup/steady numbers as Meta Ads
// (useAdLibrary.ts) — generate-social-image.ts/generate-social-video.ts
// mirror those jobs step for step, so the same realistic floor applies.
// "publishing" is a different, much faster process (posting to
// Upload-Post), so it gets its own short poll instead.
const POST_WARMUP_MS: Record<string, number> = { image: 20_000, video: 120_000, publishing: 3_000 };
const POST_STEADY_POLL_MS: Record<string, number> = { image: 8_000, video: 20_000, publishing: 3_000 };

function pollBucket(row: PostPollRow): string {
  if (row.status === "publishing") return "publishing";
  return row.format === "video" ? "video" : "image";
}

export function useSocialPosts() {
  return useQuery({
    queryKey: socialKeys.posts(),
    queryFn: async () => {
      const { data, error } = await (supabase.from("social_posts") as any)
        .select("id, status, format, idea_prompt, caption, title, media_asset_id, published_at, scheduled_at, created_at, generation_inputs, platform_connections(platform, display_name, metadata), media_assets(type, metadata)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    // Generation runs as a background Inngest job that can take a minute or
    // more — poll while anything is still generating/publishing so the
    // card flips to its finished state without a manual refresh, but don't
    // start checking until it's realistically possible to be done (see
    // src/lib/generation-polling.ts).
    refetchInterval: (query) => generationRefetchInterval<PostPollRow>(
      query.state.data as PostPollRow[] | undefined,
      IN_PROGRESS_STATUSES,
      (row) => POST_WARMUP_MS[pollBucket(row)],
      (row) => POST_STEADY_POLL_MS[pollBucket(row)]
    ),
  });
}

export interface SocialConnection {
  id: string;
  platform: string;
  display_name: string | null;
  status: string;
  metadata: any;
}

/** enabled defaults to true (PublishPostPage needs this as soon as it
 * loads); CreatePostModal passes its own open state instead, so this never
 * fires just from the Posts page being open behind an unopened modal. */
export function useConnections(enabled = true) {
  return useQuery({
    queryKey: [...socialKeys.all, "connections"] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_connections")
        .select("id, platform, display_name, status, metadata")
        .eq("account_kind", "upload_post")
        .eq("status", "connected");
      if (error) throw error;
      return (data || []) as SocialConnection[];
    },
    enabled,
  });
}

export interface PreparedPlatformRow {
  id: string;
  platform: string;
  caption: string;
  /** YouTube only — Upload-Post needs a distinct title, separate from the
   * caption (which becomes the description). Unset for every other platform. */
  title?: string;
  account: { displayName: string; avatarUrl?: string };
}

export function usePreparePlatforms() {
  return useMutation({
    mutationFn: async (input: { mediaAssetId: string; ideaPrompt: string | null; format: string; platforms: string[] }) => {
      const res = await fetch("/api/social/posts/prepare-platforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to prepare platforms");
      return data.rows as PreparedPlatformRow[];
    },
  });
}

export function useImproveCaption() {
  return useMutation({
    mutationFn: async (input: { platform: string; caption: string; instruction?: string }) => {
      const res = await fetch("/api/social/posts/improve-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to improve caption");
      return data.caption as string;
    },
  });
}

export function useUpdateCaption() {
  return useMutation({
    mutationFn: async ({ id, caption, title }: { id: string; caption: string; title?: string }) => {
      const update: { caption: string; title?: string } = { caption };
      if (title !== undefined) update.title = title;
      const { error } = await supabase.from("social_posts").update(update).eq("id", id);
      if (error) throw error;
    },
  });
}

export interface PublishPostsInput {
  socialPostIds: string[];
  /** Presence alone schedules instead of publishing immediately. */
  scheduledDate?: string;
  timezone?: string;
}

export function usePublishPosts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: string[] | PublishPostsInput) => {
      const body = Array.isArray(input) ? { socialPostIds: input } : input;
      const res = await fetch("/api/social/posts/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to publish");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: socialKeys.posts() }),
  });
}

export function useCancelSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (socialPostIds: string[]) => {
      const res = await fetch("/api/social/posts/cancel-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ socialPostIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: socialKeys.posts() }),
  });
}

/** Deletes post rows from our own DB only — this never calls Upload-Post
 * or any platform API, so a post already live on a platform stays live;
 * this just removes our tracking record of it (matches Meta Ads' Ad
 * Library delete, which only ever touches meta_ad_creatives + our own
 * storage, never Meta itself). */
export function useDeletePosts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (socialPostIds: string[]) => {
      const { error } = await supabase.from("social_posts").delete().in("id", socialPostIds);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: socialKeys.posts() }),
  });
}

export function useRetryPosts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (socialPostIds: string[]) => {
      const res = await fetch("/api/social/posts/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ socialPostIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to retry");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: socialKeys.posts() }),
  });
}
