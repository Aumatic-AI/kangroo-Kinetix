"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/Pagination";
import { TabSwitch } from "@/components/global/TabSwitch";
import { PAGE_SIZE_DENSE, paginateArray, paginationMeta } from "@/lib/pagination";
import { ROUTES } from "@/config/routes";
import { CreatePostModal } from "../components/posts/CreatePostModal";
import { PostTile } from "../components/posts/PostTile";
import { PostDetailsModal } from "../components/posts/PostDetailsModal";
import { useSocialPosts, useRetryPosts, useCancelSchedule, useDeletePosts, socialKeys } from "../hooks/usePosts";
import { groupPosts, distributeIntoColumns, matchesStatusFilter, parseStatusFilter, STATUS_FILTERS, PostGroup, PostRow, type StatusFilter } from "../lib/postGroups";
import { useQueryClient } from "@tanstack/react-query";

const TAB_LABEL: Record<StatusFilter, string> = { all: "All", drafts: "Drafts", scheduled: "Scheduled", published: "Published", failed: "Failed" };
const EMPTY_MESSAGE: Record<StatusFilter, string> = {
  all: "No posts match this filter.",
  drafts: "No drafts.",
  scheduled: "No scheduled posts.",
  published: "No published posts yet.",
  failed: "No failed posts.",
};

// Masonry grid, up to 5 columns of small tiles — a viewport shows well
// more than 10 without scrolling, so the dense page size applies here.
// Paginated in-memory over the already-grouped list (see groupPosts):
// there's no DB "post group" id to page over at the query level, since one
// logical post is stored as several rows (one per target platform) tied
// together only by a shared media_asset_id (or a timestamp coincidence for
// text posts) — see postGroups.ts. Slicing raw DB rows with .range() could
// split one group's rows across two pages, so this pages the computed
// groups array instead, after the full (lightweight) fetch.
const PAGE_SIZE = PAGE_SIZE_DENSE;

// Matches the columns-2/sm:columns-3/lg:columns-4/xl:columns-5 breakpoints
// this grid used to use — kept in sync with those same widths.
function useColumnCount() {
  const [count, setCount] = useState(2);
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      setCount(w >= 1280 ? 5 : w >= 1024 ? 4 : w >= 640 ? 3 : 2);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  return count;
}

/**
 * The one Social posts page (the former separate "Published" page was the same
 * screen on another tab; `/social/published` now redirects to `?status=published`).
 * The status tab lives in the URL (`?status=drafts|scheduled|published|failed`), so it
 * survives a refresh and the Dashboard can link straight to, e.g., failed posts.
 */
export function Posts() {
  const { data: rows = [], isLoading } = useSocialPosts();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filter = parseStatusFilter(searchParams.get("status"));
  const setFilter = (next: StatusFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("status"); else params.set("status", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailsTarget, setDetailsTarget] = useState<PostGroup | null>(null);
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const retryMutation = useRetryPosts();
  const cancelScheduleMutation = useCancelSchedule();
  const deleteMutation = useDeletePosts();
  const columnCount = useColumnCount();

  const groups = useMemo(() => groupPosts(rows as PostRow[]), [rows]);
  const counts = useMemo(
    () => Object.fromEntries(STATUS_FILTERS.map((f) => [f, groups.filter((g) => matchesStatusFilter(g, f)).length])) as Record<StatusFilter, number>,
    [groups]
  );
  const filteredGroups = useMemo(() => groups.filter((g) => matchesStatusFilter(g, filter)), [groups, filter]);
  const { totalPages } = paginationMeta(filteredGroups.length, page, PAGE_SIZE);
  const pagedGroups = useMemo(() => paginateArray(filteredGroups, page, PAGE_SIZE), [filteredGroups, page]);
  const columns = useMemo(() => distributeIntoColumns(pagedGroups, columnCount), [pagedGroups, columnCount]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: socialKeys.posts() });

  const emptyMessage = groups.length === 0 ? "No posts yet — create your first one." : EMPTY_MESSAGE[filter];

  return (
    <div className="space-y-6 pb-10">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-text">Posts</h2>
          <p className="text-sm text-muted mt-1">Create once, publish everywhere your accounts are connected. Drafts, scheduled, published and failed posts, all in one place.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} icon={<Plus className="w-4 h-4" />}>
          Create Post
        </Button>
      </div>

      <TabSwitch
        value={filter}
        onValueChange={(v) => { setFilter(v as StatusFilter); setPage(1); }}
        items={STATUS_FILTERS.map((f) => ({ value: f, label: TAB_LABEL[f], count: counts[f] }))}
      />

      {isLoading ? (
        <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-4">
          {Array.from({ length: PAGE_SIZE }, (_, i) => (
            <Skeleton key={i} className="mb-4 break-inside-avoid rounded-2xl w-full" style={{ height: 180 + (i % 3) * 60 }} />
          ))}
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="text-center py-24 text-muted border border-default rounded-2xl border-dashed">
          <p className="mb-4">{emptyMessage}</p>
        </div>
      ) : (
        <>
          <div className="flex gap-4 items-start">
            {columns.map((column, i) => (
              <div key={i} className="flex-1 min-w-0 flex flex-col gap-4">
                {column.map((g) => (
                  <PostTile
                    key={g.key}
                    group={g}
                    onPublish={(group) => {
                      // Text posts have no media_asset_id to key off of —
                      // route by socialPostIds instead. Still starts at step 1
                      // (like image/video) so platforms can be reconsidered,
                      // not just the fresh-generation redirect which skips
                      // straight to preview.
                      const url = group.format === "text"
                        ? `${ROUTES.SOCIAL.POSTS_PUBLISH}?socialPostIds=${group.rows.map((r) => r.id).join(",")}`
                        : `${ROUTES.SOCIAL.POSTS_PUBLISH}?mediaAssetId=${group.mediaAssetId}`;
                      router.push(url);
                    }}
                    onViewDetails={setDetailsTarget}
                    onRetry={(group) => retryMutation.mutate(group.rows.filter((r) => r.status === "failed").map((r) => r.id))}
                    onCancelSchedule={(group) => cancelScheduleMutation.mutate(group.rows.filter((r) => r.status === "scheduled").map((r) => r.id))}
                    onDelete={(group) => deleteMutation.mutateAsync(group.rows.map((r) => r.id))}
                  />
                ))}
              </div>
            ))}
          </div>

          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}

      <CreatePostModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={invalidate}
      />

      <PostDetailsModal group={detailsTarget} onClose={() => setDetailsTarget(null)} />
    </div>
  );
}
