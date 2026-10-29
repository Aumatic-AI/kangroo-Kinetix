"use client";
import { useState } from "react";
import Image from "next/image";
import { Loader2, Video, Image as ImageIcon, MessageSquareText, AlertCircle, Info, RotateCcw, Clock, X, Sparkles, MoreVertical, Trash2, Send, CheckCircle2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { PostGroup, groupState } from "../../lib/postGroups";
import { Lightbox } from "./Lightbox";
import { formatDateTime } from "@/utils/datetime";

interface PostTileProps {
  group: PostGroup;
  onPublish: (group: PostGroup) => void;
  onViewDetails: (group: PostGroup) => void;
  onRetry: (group: PostGroup) => void;
  onCancelSchedule: (group: PostGroup) => void;
  onDelete: (group: PostGroup) => Promise<void>;
}

const ASPECT_CLASS: Record<PostGroup["aspectRatio"], string> = {
  "16:9": "aspect-[16/9]",
  "9:16": "aspect-[9/16]",
  "4:5": "aspect-[4/5]",
  "1:1": "aspect-square",
};

export function PostTile({ group, onPublish, onViewDetails, onRetry, onCancelSchedule, onDelete }: PostTileProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const state = groupState(group);
  const isVideo = group.mediaType === "video";
  const isText = group.format === "text";
  const scheduledAt = group.rows.find((r) => r.status === "scheduled")?.scheduled_at || null;
  const hasMenu = state === "published" || state === "draft" || state === "failed" || state === "scheduled";

  const confirmDelete = async () => {
    setDeleteError("");
    setDeleting(true);
    try {
      await onDelete(group);
      setConfirmingDelete(false);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="relative rounded-2xl overflow-hidden bg-surface group">
        {isText ? (
          <div
            onClick={() => onViewDetails(group)}
            className={`w-full ${ASPECT_CLASS[group.aspectRatio]} flex flex-col items-center justify-center gap-2 text-muted cursor-pointer hover:bg-secondary transition-colors`}
          >
            <MessageSquareText className="w-8 h-8" />
            <span className="text-xs font-semibold">Text Post</span>
          </div>
        ) : group.thumbnailUrl ? (
          <div className="cursor-zoom-in" onClick={() => setLightboxOpen(true)}>
            {isVideo ? (
              <video src={group.thumbnailUrl} className="w-full h-auto block" muted preload="metadata" />
            ) : (
              <Image
                src={group.thumbnailUrl}
                alt=""
                width={1080}
                height={1350}
                className="w-full h-auto block"
                sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              />
            )}
          </div>
        ) : (
          <div className={`w-full ${ASPECT_CLASS[group.aspectRatio]} flex flex-col items-center justify-center gap-2 text-muted`}>
            {state === "generating" ? (
              <>
                <div className="relative w-8 h-8">
                  <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
                  <Sparkles className="absolute inset-0 m-auto w-3 h-3 text-primary animate-pulse" />
                </div>
                <p className="text-xs font-semibold text-text">Generating...</p>
              </>
            ) : group.format === "video" ? <Video className="w-6 h-6" /> : <ImageIcon className="w-6 h-6" />}
          </div>
        )}

        {state === "publishing" && (
          <span className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-black/60 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full pointer-events-none">
            <Loader2 className="w-3 h-3 animate-spin" /> Publishing
          </span>
        )}
        {state === "failed" && (
          <span className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-danger text-white text-[11px] font-semibold px-2.5 py-1 rounded-full pointer-events-none">
            <AlertCircle className="w-3 h-3" /> Failed
          </span>
        )}
        {state === "scheduled" && (
          <span className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-black/60 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full pointer-events-none">
            <Clock className="w-3 h-3" /> {formatDateTime(scheduledAt)}
          </span>
        )}
        {state === "published" && (
          <span className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-success text-white text-[11px] font-semibold px-2.5 py-1 rounded-full pointer-events-none">
            <CheckCircle2 className="w-3 h-3" /> Published
          </span>
        )}

        {hasMenu && (
          <div className="absolute top-2.5 right-2.5" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="More actions"
                className="w-7 h-7 flex items-center justify-center rounded-full bg-black/70 backdrop-blur-sm border border-white/15 text-white hover:bg-black/85 transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {state === "draft" && (
                  <DropdownMenuItem onClick={() => onPublish(group)}>
                    <Send className="w-4 h-4" /> Publish
                  </DropdownMenuItem>
                )}
                {state === "published" && (
                  <DropdownMenuItem onClick={() => onViewDetails(group)}>
                    <Info className="w-4 h-4" /> View Details
                  </DropdownMenuItem>
                )}
                {state === "failed" && (
                  <DropdownMenuItem onClick={() => onRetry(group)}>
                    <RotateCcw className="w-4 h-4" /> Retry
                  </DropdownMenuItem>
                )}
                {state === "scheduled" && (
                  <DropdownMenuItem onClick={() => onCancelSchedule(group)}>
                    <X className="w-4 h-4" /> Cancel Schedule
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmingDelete(true)}>
                  <Trash2 className="w-4 h-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {lightboxOpen && group.thumbnailUrl && (
        <Lightbox mediaUrl={group.thumbnailUrl} mediaType={isVideo ? "video" : "image"} onClose={() => setLightboxOpen(false)} />
      )}

      <ConfirmModal
        open={confirmingDelete}
        onOpenChange={(open) => { if (!open && !deleting) { setConfirmingDelete(false); setDeleteError(""); } }}
        title="Delete this post?"
        description="This only removes it from Kinetix — if it's already live on a platform, it stays posted there. This can't be undone here."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        error={deleteError}
        onConfirm={confirmDelete}
      />
    </>
  );
}
