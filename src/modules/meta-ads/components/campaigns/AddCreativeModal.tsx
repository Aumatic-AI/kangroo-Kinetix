"use client";
import { useEffect, useState } from "react";
import { Plus, Video, Image as ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { useCreateAd } from "../../hooks/useCampaigns";
import { MetaAdCreativePickerItem, CreateAdInput } from "../../types/meta-ads.types";
import { CampaignPickCreativeDialog } from "./CampaignPickCreativeDialog";
import { AdCopyFields, DEFAULT_AD_COPY, AdCopyState } from "./shared";

/**
 * "+ Add Creative" on an existing Ad Set — a new Ad under an ad set that
 * already exists, inheriting its targeting/budget/optimization goal
 * untouched (see campaigns/ad-sets/[adSetId]/ads/route.ts). Only the
 * creative and its ad copy are asked here.
 */
export function AddCreativeModal({
  adSetId,
  campaignId,
  isLeadGenAdSet,
  open,
  onClose,
}: {
  adSetId: string;
  campaignId: string;
  isLeadGenAdSet: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const createAd = useCreateAd(adSetId, campaignId);
  const [creative, setCreative] = useState<MetaAdCreativePickerItem | null>(null);
  const [pickingCreative, setPickingCreative] = useState(false);
  const [adCopy, setAdCopy] = useState<AdCopyState>(DEFAULT_AD_COPY);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setCreative(null);
    setAdCopy(DEFAULT_AD_COPY);
    setError("");
  }, [open]);

  useEffect(() => {
    if (!creative) return;
    setAdCopy((prev) => ({
      ...prev,
      adName: prev.adName || creative.idea_prompt?.slice(0, 60) || "New ad",
      headline: creative.ad_script?.headline || prev.headline,
      primaryText: creative.ad_script?.primary_text || prev.primaryText,
    }));
  }, [creative]);

  const isVideo = creative?.type === "video";
  const patchAdCopy = (patch: Partial<AdCopyState>) => setAdCopy((prev) => ({ ...prev, ...patch }));

  const handleCreate = async () => {
    setError("");
    if (!creative) return setError("Pick a creative first.");
    if (!adCopy.adName.trim()) return setError("Ad name is required.");
    if (!adCopy.headline.trim() || !adCopy.primaryText.trim()) return setError("Headline and primary text are required.");
    if (isLeadGenAdSet && !adCopy.leadGenFormId) return setError("This ad set only accepts Instant Form leads — pick a form.");
    if (!isLeadGenAdSet && !adCopy.websiteUrl.trim()) return setError("Destination URL is required.");

    try {
      const input: CreateAdInput = {
        adName: adCopy.adName.trim(),
        creativeId: creative.id,
        headline: adCopy.headline.trim(),
        primaryText: adCopy.primaryText.trim(),
        description: adCopy.description.trim() || undefined,
        ctaType: adCopy.ctaType,
        websiteUrl: adCopy.websiteUrl.trim(),
        leadGenFormId: adCopy.leadGenFormId || undefined,
      };
      await createAd.mutateAsync(input);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add creative");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-lg sm:max-w-lg bg-background border-border text-text p-0 sm:rounded-xl gap-0 overflow-hidden outline-none flex flex-col max-h-[85vh] shadow-lg">
          <DialogHeader className="px-6 py-5 border-b border-border shrink-0">
            <DialogTitle className="flex items-center gap-2"><Plus className="w-4 h-4 text-primary" /> Add Creative</DialogTitle>
            <p className="text-xs text-muted">Adds a new ad to this ad set — same targeting and budget, different creative.</p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <div className="w-16 h-16 rounded-md bg-surface overflow-hidden shrink-0 flex items-center justify-center">
                {creative?.media_urls?.[0] ? (
                  isVideo ? (
                    <video src={creative.media_urls[0]} className="w-full h-full object-cover" muted preload="metadata" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={creative.media_urls[0]} alt="" className="w-full h-full object-cover" />
                  )
                ) : creative?.type === "video" ? (
                  <Video className="w-5 h-5 text-muted" />
                ) : (
                  <ImageIcon className="w-5 h-5 text-muted" />
                )}
              </div>
              <p className="flex-1 min-w-0 text-sm font-semibold text-text truncate">
                {creative ? creative.ad_script?.headline || "Untitled creative" : "No creative selected"}
              </p>
              <Button size="sm" variant="outline" onClick={() => setPickingCreative(true)}>{creative ? "Change" : "Choose creative"}</Button>
            </div>
            <AdCopyFields state={adCopy} setState={patchAdCopy} showLeadForm={isLeadGenAdSet} leadFormRequired={isLeadGenAdSet} />
            {error && <p className="text-sm text-danger font-medium">{error}</p>}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 sm:justify-between">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleCreate} loading={createAd.isPending} icon={<Plus className="w-4 h-4" />}>
              {createAd.isPending ? "Adding…" : "Add Creative (paused)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CampaignPickCreativeDialog open={pickingCreative} onClose={() => setPickingCreative(false)} onPick={(c) => { setCreative(c); setPickingCreative(false); }} />
    </>
  );
}
