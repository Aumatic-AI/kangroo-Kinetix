"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Dropdown } from "@/components/ui/Dropdown";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/Switch";
import { ROUTES } from "@/config/routes";
import { formatDate } from "@/utils/datetime";
import { Pill } from "@/modules/listings/components/ListingBits";
import { contentKeys, useActivity, useAutomationSettings, useDeleteContent, useGallery, useTriggerGeneration } from "../hooks/useContent";
import { ActivityPanel } from "../components/ActivityPanel";
import { ContentDetailDrawer } from "../components/ContentDetailDrawer";
import { GenerationChip, MediaPreview } from "../components/ContentBits";
import { TYPE_LABEL, earliestSlot, formatSlot } from "../lib/format";
import type { GalleryItem } from "../types/content.types";

const PAGE_SIZE = 12;

const CONTENT_OPTIONS = [
  { value: "all", label: "All content" },
  { value: "video", label: "Videos" },
  { value: "image", label: "Images" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "blog", label: "Blogs" },
];
const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "completed", label: "Generated" },
  { value: "processing", label: "Generating" },
  { value: "failed", label: "Failed" },
];

function Card({ item, onOpen, onDelete }: { item: GalleryItem; onOpen: () => void; onDelete: () => void }) {
  const cur = item.current;
  // No valid version: still show the newest attempt's media (badged), so rejected renders can be watched.
  const shown = cur ?? item.latestAttempt;
  const isBlog = item.contentType === "blog";
  const slot = earliestSlot(cur?.proposedSchedule);
  return (
    <div className="relative">
    <button type="button" onClick={onOpen} className="block w-full text-left border border-default rounded-lg overflow-hidden bg-background hover:bg-surface transition-colors">
      <div className="relative">
        <MediaPreview url={shown?.mediaUrl ?? null} mediaType={shown?.mediaType ?? null} contentType={item.contentType} className={isBlog ? "w-full aspect-[16/10]" : "w-full aspect-[4/5]"} />
        <div className="absolute top-2 left-2"><GenerationChip status={item.generationStatus} /></div>
        {shown?.videoDuration ? <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-bold">{shown.videoDuration}s</span> : null}
      </div>
      <div className="p-3 space-y-2">
        {isBlog ? (
          <>
            <p className="text-sm font-semibold text-text line-clamp-2">{cur?.script || "Writing the blog post…"}</p>
            <p className="text-xs text-muted truncate">{item.propertyTitle}{item.city ? ` · ${item.city}` : ""}</p>
          </>
        ) : (
          <p className="text-sm font-semibold text-text truncate">{item.propertyTitle}</p>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Pill>{TYPE_LABEL[item.contentType]}</Pill>
          {!isBlog && <Pill>{item.pipeline === "linkedin" ? "LinkedIn" : "Social"}</Pill>}
          {item.regenerating && <Pill tone="warning">Regenerating</Pill>}
          {!cur && item.latestAttempt && <Pill tone="danger">Failed checks · v{item.latestAttempt.number}</Pill>}
        </div>
        <p className="text-xs text-muted truncate">
          {slot ? `Proposed ${formatSlot(slot)}${(cur?.proposedSchedule?.length ?? 0) > 1 ? ` +${(cur?.proposedSchedule?.length ?? 1) - 1}` : ""}` : `Generated ${formatDate(item.createdAt)}`}
        </p>
      </div>
    </button>
    {item.generationStatus !== "processing" && (
      <button
        type="button"
        onClick={onDelete}
        title="Delete"
        aria-label={`Delete ${item.propertyTitle}`}
        className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-background border border-default flex items-center justify-center text-muted hover:text-danger hover:bg-surface transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    )}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="border border-default rounded-lg overflow-hidden">
          <Skeleton className="w-full aspect-[4/5]" />
          <div className="p-3 space-y-2"><Skeleton className="h-3.5 w-3/4 rounded" /><Skeleton className="h-4 w-1/2 rounded-full" /><Skeleton className="h-3 w-2/3 rounded" /></div>
        </div>
      ))}
    </div>
  );
}

/**
 * The gallery: everything the AI generated, newest first, with its proposed
 * posting times. Generated content stays here — in the testing phase nothing is
 * published anywhere. "Generate now" is the TEMPORARY manual trigger that
 * replaces the weekly automation until content generation is finalized.
 */
export function GalleryPage() {
  const [page, setPage] = useState(1);
  const [content, setContent] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<{ id: string; title: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // What "Generate now" creates: each type can be switched off, at least one must stay on.
  // Social is split by format — the user decides image vs video, the AI follows it.
  const [include, setInclude] = useState({ socialImage: true, socialVideo: true, linkedin: true, blog: true });

  const settings = useAutomationSettings();
  const trigger = useTriggerGeneration();
  const del = useDeleteContent();

  // A new card only exists once its job has written the first row (the agent runs for ~30 s before
  // that), so the gallery's own "poll while something is generating" can't see it yet. Follow the
  // activity feed instead: while any job is in flight, and once more when the last one ends, refresh the grid.
  const qc = useQueryClient();
  const activity = useActivity();
  const jobsInFlight = activity.data?.jobs.some((j) => j.status === "pending" || j.status === "processing") ?? false;
  const wasInFlight = useRef(false);
  useEffect(() => {
    if (jobsInFlight || wasInFlight.current) qc.invalidateQueries({ queryKey: [...contentKeys.all, "gallery"] });
    wasInFlight.current = jobsInFlight;
  }, [activity.dataUpdatedAt, jobsInFlight, qc]);
  const [toDelete, setToDelete] = useState<GalleryItem | null>(null);
  const { data, isLoading, error } = useGallery({
    page, limit: PAGE_SIZE,
    type: content === "video" || content === "image" ? content : undefined,
    pipeline: content === "linkedin" || content === "blog" ? content : undefined,
    status: status === "all" ? undefined : status,
  });

  const enabled = settings.data?.isEnabled ?? false;
  const generate = async () => {
    try {
      await trigger.mutateAsync({
        socialImage: include.socialImage ? 1 : 0, socialVideo: include.socialVideo ? 1 : 0,
        linkedin: include.linkedin ? 1 : 0, blog: include.blog ? 1 : 0,
      });
      setConfirmOpen(false);
      setPage(1);
    } catch {
      /* shown inline in the dialog */
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-text">Content Gallery</h2>
          <p className="text-sm text-muted mt-1">AI-generated property content — social posts, LinkedIn posts and blogs. Generated content stays here.</p>
        </div>
        <Button onClick={() => setConfirmOpen(true)} disabled={!enabled}><Sparkles /> Generate now</Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap rounded-lg border border-default bg-surface px-4 py-3 text-sm">
        <Pill tone="warning">Testing mode</Pill>
        <span className="text-muted">Nothing is published anywhere — blogs are display-only. Automatic weekly runs are off.</span>
        {settings.data && !enabled && (
          <span className="text-muted">Generation is paused — <Link href={ROUTES.CONTENT.AUTOMATION} className="text-text font-medium hover:underline">enable it in Automation</Link> to use Generate now.</span>
        )}
      </div>

      <ActivityPanel />

      <div className="flex items-center gap-3">
        <Dropdown options={CONTENT_OPTIONS} value={content} onValueChange={(v) => { setContent(v); setPage(1); }} className="w-48 shrink-0" />
        <Dropdown options={STATUS_OPTIONS} value={status} onValueChange={(v) => { setStatus(v); setPage(1); }} className="w-48 shrink-0" />
      </div>

      {isLoading ? (
        <GridSkeleton />
      ) : error ? (
        <div className="py-16 text-center border border-default rounded-2xl border-dashed"><p className="text-sm text-danger font-medium">{error.message}</p></div>
      ) : !data || data.items.length === 0 ? (
        <div className="py-16 text-center border border-default rounded-2xl border-dashed space-y-2">
          <p className="text-sm text-muted">{content !== "all" || status !== "all" ? "Nothing matches these filters." : "Nothing generated yet. Use Generate now to create the first posts."}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {data.items.map((item) => <Card key={item.id} item={item} onOpen={() => setSelected({ id: item.id, title: item.propertyTitle })} onDelete={() => { del.reset(); setToDelete(item); }} />)}
          </div>
          <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={setPage} />
        </>
      )}

      <ContentDetailDrawer contentId={selected?.id ?? null} title={selected?.title} onClose={() => setSelected(null)} />

      <ConfirmModal
        open={!!toDelete}
        onOpenChange={(o) => { if (!del.isPending && !o) setToDelete(null); }}
        title="Delete this item?"
        description={toDelete ? `${toDelete.propertyTitle} (${TYPE_LABEL[toDelete.contentType]}) and all of its revisions will be permanently removed from the gallery. This can't be undone.` : ""}
        confirmLabel="Delete"
        variant="destructive"
        loading={del.isPending}
        error={del.error?.message}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await del.mutateAsync(toDelete.id);
            if (selected?.id === toDelete.id) setSelected(null);
            setToDelete(null);
          } catch { /* shown inline in the dialog */ }
        }}
      />

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={(o) => { if (!trigger.isPending) setConfirmOpen(o); }}
        title="Generate content now?"
        description="The AI picks the next properties in the rotation and creates content for the upcoming week. This only fills the gallery — nothing is published."
        details={
          <dl className="text-sm space-y-3">
            {([
              ["socialImage", "Social image", "one 4:5 image for TikTok, Instagram and Facebook"],
              ["socialVideo", "Social video", "one 30-second vertical video for TikTok, Instagram and Facebook"],
              ["linkedin", "LinkedIn post", "text + image"],
              ["blog", "Blog post", "detailed article; the AI chooses the format and writes its images"],
            ] as const).map(([key, label, hint]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <div>
                  <dt className="font-medium text-text">{label}</dt>
                  <dd className="text-muted">{hint}</dd>
                </div>
                <Switch checked={include[key]} onCheckedChange={(v) => setInclude((c) => ({ ...c, [key]: v }))} />
              </div>
            ))}
            <div className="flex justify-between gap-4 pt-1"><dt className="text-muted">Posting times</dt><dd className="font-medium text-text text-right">Proposed by the AI for social and LinkedIn, not scheduled</dd></div>
          </dl>
        }
        confirmLabel="Generate"
        confirmDisabled={!Object.values(include).some(Boolean)}
        loading={trigger.isPending}
        error={trigger.error?.message}
        onConfirm={generate}
      />
    </div>
  );
}
