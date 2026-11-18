import type { Platform } from "./platforms";

export interface PostRow {
  id: string;
  status: string;
  format: string | null;
  idea_prompt: string | null;
  caption: string | null;
  title: string | null;
  media_asset_id: string | null;
  created_at: string;
  published_at: string | null;
  scheduled_at: string | null;
  generation_inputs: { aspectRatio?: string } | null;
  platform_connections: { platform: Platform; display_name: string | null; metadata: any } | null;
  media_assets: { type: string; metadata: any } | null;
}

export interface PostGroup {
  key: string;
  createdAt: string;
  format: string;
  ideaPrompt: string | null;
  thumbnailUrl: string | null;
  mediaType: string | null;
  mediaAssetId: string | null;
  /** What the finished media's aspect ratio is/will be — videos are always
   * generated 9:16 (no per-post choice), images use whatever ratio the user
   * picked in Create Post (defaulting to 4:5, matching generate-social-image's
   * own default). Known before generation finishes, so the "Generating"
   * placeholder can be sized to match instead of guessing. */
  aspectRatio: "16:9" | "9:16" | "4:5" | "1:1";
  rows: PostRow[];
}

function resolveAspectRatio(row: PostRow): PostGroup["aspectRatio"] {
  if (row.format === "video") return "9:16";
  const requested = row.generation_inputs?.aspectRatio;
  return requested === "16:9" || requested === "9:16" || requested === "1:1" ? requested : "4:5";
}

export function groupPosts(rows: PostRow[]): PostGroup[] {
  const groups = new Map<string, PostGroup>();
  for (const row of rows) {
    const key = row.media_asset_id || `${row.created_at}|${row.idea_prompt}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        createdAt: row.created_at,
        format: row.format || "image",
        ideaPrompt: row.idea_prompt,
        thumbnailUrl: row.media_assets?.metadata?.publicUrl || null,
        mediaType: row.media_assets?.type || null,
        mediaAssetId: row.media_asset_id,
        aspectRatio: resolveAspectRatio(row),
        rows: [],
      });
    }
    groups.get(key)!.rows.push(row);
  }
  return [...groups.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

const ASPECT_RATIO_HEIGHT_FACTOR: Record<PostGroup["aspectRatio"], number> = {
  "16:9": 9 / 16,
  "9:16": 16 / 9,
  "4:5": 5 / 4,
  "1:1": 1,
};

/**
 * True masonry (each item goes in the shortest column so far), not CSS
 * multi-column — CSS columns fill strictly top-to-bottom per column in DOM
 * order, which leaves uneven gaps whenever tiles have different heights
 * (exactly what varying aspect ratios per post produce). Heights are
 * estimated from each group's known aspect ratio at a shared column width,
 * so columns can be balanced without waiting to measure real image
 * dimensions after load.
 */
export function distributeIntoColumns(groups: PostGroup[], columnCount: number): PostGroup[][] {
  const columns: PostGroup[][] = Array.from({ length: columnCount }, () => []);
  const columnHeights = new Array(columnCount).fill(0);
  for (const group of groups) {
    let shortest = 0;
    for (let i = 1; i < columnCount; i++) {
      if (columnHeights[i] < columnHeights[shortest]) shortest = i;
    }
    columns[shortest].push(group);
    columnHeights[shortest] += ASPECT_RATIO_HEIGHT_FACTOR[group.aspectRatio];
  }
  return columns;
}

export type GroupState = "generating" | "failed" | "publishing" | "scheduled" | "draft" | "published";

/** Priority: an in-flight generation always wins, then anything broken
 * needs attention, then anything mid-publish or scheduled for later, then
 * anything still unposted, and only once every row is actually live do we
 * call the whole group "published". */
export function groupState(group: PostGroup): GroupState {
  if (group.rows.some((r) => r.status === "generating")) return "generating";
  if (group.rows.some((r) => r.status === "failed")) return "failed";
  if (group.rows.some((r) => r.status === "publishing")) return "publishing";
  if (group.rows.some((r) => r.status === "scheduled")) return "scheduled";
  if (group.rows.some((r) => r.status === "draft")) return "draft";
  return "published";
}

/** The Posts page's status tabs. Kept in the URL as `?status=` (absent = all). */
export const STATUS_FILTERS = ["all", "drafts", "scheduled", "published", "failed"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export function parseStatusFilter(value: string | null | undefined): StatusFilter {
  return (STATUS_FILTERS as readonly string[]).includes(value ?? "") ? (value as StatusFilter) : "all";
}

/**
 * Whether a post (a group of per-platform rows) belongs under a tab. Each tab
 * matches ANY platform in that state, so a post that went out on two platforms
 * and failed on a third shows under both Published and Failed — nothing is
 * hidden behind the group's single overall state. Posts still generating or
 * publishing appear under All (with their badge).
 */
export function matchesStatusFilter(group: PostGroup, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  const status = { drafts: "draft", scheduled: "scheduled", published: "published", failed: "failed" }[filter];
  return group.rows.some((r) => r.status === status);
}
