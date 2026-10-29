"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { groupPosts, distributeIntoColumns, groupState, PostGroup, PostRow } from "../lib/postGroups";
import { useQueryClient } from "@tanstack/react-query";

type StatusFilter = "all" | "published" | "scheduled";

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

interface PostsProps {
  heading?: string;
  description?: string;
  /** Which status pill is active on load — the Gallery page defaults to
   * "all", the Published page defaults to "published". Either page can
   * still pivot to any of the three from the pills, so this only sets the
   * starting point, not a hard restriction. */
  defaultFilter?: StatusFilter;
}

export function Posts({ heading = "Gallery", description = "Create once, publish everywhere your accounts are connected.", defaultFilter = "all" }: PostsProps) {
  const { data: rows = [], isLoading } = useSocialPosts();
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailsTarget, setDetailsTarget] = useState<PostGroup | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<StatusFilter>(defaultFilter);
  const queryClient = useQueryClient();
  const retryMutation = useRetryPosts();
  const cancelScheduleMutation = useCancelSchedule();
  const deleteMutation = useDeletePosts();
  const columnCount = useColumnCount();

  const groups = useMemo(() => groupPosts(rows as PostRow[]), [rows]);
  const publishedCount = useMemo(() => groups.filter((g) => groupState(g) === "published").length, [groups]);
  const scheduledCount = useMemo(() => groups.filter((g) => groupState(g) === "scheduled").length, [groups]);
  const filteredGroups = useMemo(
    () => (filter === "all" ? groups : groups.filter((g) => groupState(g) === filter)),
    [groups, filter]
  );
  const { totalPages } = paginationMeta(filteredGroups.length, page, PAGE_SIZE);
  const pagedGroups = useMemo(() => paginateArray(filteredGroups, page, PAGE_SIZE), [filteredGroups, page]);
  const columns = useMemo(() => distributeIntoColumns(pagedGroups, columnCount), [pagedGroups, columnCount]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: socialKeys.posts() });

  const emptyMessage =
    groups.length === 0
      ? "No posts yet — create your first one."
      : filter === "published"
      ? "No published posts yet."
      : filter === "scheduled"
      ? "No scheduled posts."
      : "No posts match this filter.";

  return (
    <div className="space-y-6 pb-10">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-text">{heading}</h2>
          <p className="text-sm text-muted mt-1">{description}</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} icon={<Plus className="w-4 h-4" />}>
          Create Post
        </Button>
      </div>

      <TabSwitch
        value={filter}
        onValueChange={(v) => { setFilter(v as StatusFilter); setPage(1); }}
        items={[
          { value: "all", label: "All", count: groups.length },
          { value: "published", label: "Published", count: publishedCount },
          { value: "scheduled", label: "Scheduled", count: scheduledCount },
        ]}
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
