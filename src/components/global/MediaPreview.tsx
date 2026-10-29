"use client";
import { Video as VideoIcon, Image as ImageIcon } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/** A big, focused preview of one image or video — opened by the play
 * button on a creative thumbnail wherever creatives are picked (Ad Library,
 * the creative picker dialog, Campaign Details). Deliberately just the
 * media itself, no copy/metadata alongside it — this is for looking closely
 * at the asset, not reading about it. */
export function MediaPreview({
  open,
  onClose,
  mediaUrl,
  type,
  duration,
  aspectRatio = "9/16",
}: {
  open: boolean;
  onClose: () => void;
  mediaUrl: string | null;
  type: "video" | "image";
  /** Optional — shown as a small chip in the top-left corner (e.g. "28s"). */
  duration?: string | null;
  /** CSS aspect-ratio value, e.g. "4/5", "16/9" — defaults to the existing 9/16 story shape. */
  aspectRatio?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl sm:max-w-3xl bg-black border-border p-0 sm:rounded-xl gap-0 overflow-hidden outline-none shadow-lg">
        <div className="relative w-full max-h-[85vh] mx-auto bg-black flex items-center justify-center" style={{ aspectRatio }}>
          {duration && (
            <span className="absolute top-3 left-3 z-10 px-2 py-1 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-white text-[11px] font-bold uppercase tracking-wide">
              {duration}
            </span>
          )}
          {mediaUrl ? (
            type === "video" ? (
              <video src={mediaUrl} className="w-full h-full object-contain" controls autoPlay />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl} alt="" className="w-full h-full object-contain" />
            )
          ) : (
            <div className="text-white/50 flex flex-col items-center gap-2">
              {type === "video" ? <VideoIcon size={40} /> : <ImageIcon size={40} />}
              <p className="text-sm font-medium">Media not available</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
