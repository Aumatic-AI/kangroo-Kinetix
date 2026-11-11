"use client";
import { useState } from "react";
import { Play, ImageIcon, FileText, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pill } from "@/modules/listings/components/ListingBits";
import type { ContentType, GenerationStatus } from "../types/content.types";

const STATUS: Record<GenerationStatus, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  completed: { label: "Generated", tone: "success" },
  processing: { label: "Generating", tone: "warning" },
  pending: { label: "Queued", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function GenerationChip({ status }: { status: GenerationStatus }) {
  const s = STATUS[status];
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

const TYPE_ICON = { video: Play, image: ImageIcon, text_image: FileText, blog: BookOpen } as const;

/** Preview tile: the generated image/video, or a neutral placeholder while it is generating or failed. */
export function MediaPreview({ url, mediaType, contentType, controls = false, className }: {
  url: string | null; mediaType: "image" | "video" | null; contentType: ContentType; controls?: boolean; className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const Icon = TYPE_ICON[contentType];
  if (!url || failed) {
    return (
      <div className={cn("flex items-center justify-center bg-surface text-muted", className)}>
        <Icon className="w-6 h-6" />
      </div>
    );
  }
  if (mediaType === "video") {
    return (
      <video
        src={url} controls={controls} muted={!controls} playsInline preload="metadata" onError={() => setFailed(true)}
        className={cn("bg-surface object-cover", className)}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} className={cn("bg-surface object-cover", className)} />
  );
}
