"use client";
import { useState } from "react";
import { Video, Image as ImageIcon, Play } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMetaAdCreativesForPicker } from "../../hooks/useAdLibrary";
import { MetaAdCreativePickerItem } from "../../types/meta-ads.types";
import { MediaPreview } from "@/components/global/MediaPreview";

/** A picker over every approved creative, reused wherever a flow needs one:
 * CreateCampaignPage's step 3, AddAdSetModal, and AddCreativeModal all
 * open this same dialog rather than each rolling their own grid. */
export function CampaignPickCreativeDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (creative: MetaAdCreativePickerItem) => void }) {
  const { data: ads = [] } = useMetaAdCreativesForPicker({ status: "approved" });
  const [previewing, setPreviewing] = useState<MetaAdCreativePickerItem | null>(null);

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-3xl sm:max-w-3xl bg-background border-border text-text p-0 sm:rounded-xl gap-0 overflow-hidden outline-none flex flex-col h-[75vh] shadow-lg">
          <DialogHeader className="px-6 py-5 border-b border-border shrink-0">
            <DialogTitle>Pick a creative to launch</DialogTitle>
            <p className="text-xs text-muted">Only approved creatives can be launched — approve one in Ad Library first if you don&apos;t see it here.</p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6">
            {ads.length === 0 ? (
              <div className="py-16 text-center text-muted text-sm">No approved creatives yet.</div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {ads.map((ad) => (
                  <button
                    key={ad.id}
                    onClick={() => onPick(ad)}
                    className="relative text-left rounded-lg border border-border overflow-hidden hover:border-primary hover:shadow-md transition-all bg-background"
                  >
                    <div className="aspect-video bg-surface flex items-center justify-center">
                      {ad.media_urls?.[0] ? (
                        ad.type === "video" ? (
                          <video src={ad.media_urls[0]} className="w-full h-full object-cover" muted preload="metadata" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={ad.media_urls[0]} alt="" className="w-full h-full object-cover" />
                        )
                      ) : ad.type === "video" ? (
                        <Video className="w-6 h-6 text-muted" />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-muted" />
                      )}
                    </div>
                    {ad.media_urls?.[0] && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); setPreviewing(ad); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setPreviewing(ad); } }}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
                        title="Preview"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <MediaPreview
        open={!!previewing}
        onClose={() => setPreviewing(null)}
        mediaUrl={previewing?.media_urls?.[0] || null}
        type={previewing?.type === "video" ? "video" : "image"}
        aspectRatio={previewing?.aspect_ratio ? previewing.aspect_ratio.replace(":", "/") : undefined}
      />
    </>
  );
}
