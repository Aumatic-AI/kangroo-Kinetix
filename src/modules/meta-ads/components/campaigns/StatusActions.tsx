"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useUpdateStatus, useSmartRun, useArchiveCampaign } from "../../hooks/useCampaigns";

type ActionKind = "resume" | "pause" | "archive" | "golive";

const CONFIRM_COPY: Record<ActionKind, { title: string; description: string; confirmLabel: string; variant: "primary" | "destructive" }> = {
  resume: { title: "Resume?", description: "This makes it active again — it can start spending right away.", confirmLabel: "Resume", variant: "primary" },
  pause: { title: "Pause?", description: "This stops delivery immediately. You can resume it anytime.", confirmLabel: "Pause", variant: "primary" },
  archive: { title: "Archive?", description: "This is permanent — Meta doesn't allow un-archiving from here.", confirmLabel: "Archive", variant: "destructive" },
  golive: {
    title: "Go live with this ad?",
    description: "Every other ad in this campaign will be paused, and this ad, its ad set, and the campaign will all be activated.",
    confirmLabel: "Go Live",
    variant: "primary",
  },
};

/**
 * Pause / Resume / Archive (+ "Go Live" for an Ad) — the same four
 * state-changing actions available at every level of the hierarchy, always
 * gated behind ConfirmModal so nothing fires from a single accidental
 * click. Shared by the Campaign, Ad Set, and Ad detail pages. Labels only,
 * no icons — these pages have the room, unlike a dense table row.
 */
export function StatusActions({
  level,
  id,
  campaignId,
  status,
  showGoLive,
}: {
  level: "campaign" | "adset" | "ad";
  id: string;
  campaignId: string;
  status: string;
  /** Only meaningful for level="ad" — "make this the live ad" pauses every
   * sibling ad in the campaign, so it's never offered for campaigns/ad sets. */
  showGoLive?: boolean;
}) {
  const updateStatus = useUpdateStatus();
  const smartRun = useSmartRun();
  const archiveCampaign = useArchiveCampaign();
  const [confirming, setConfirming] = useState<ActionKind | null>(null);
  const [error, setError] = useState("");

  const isActive = status === "ACTIVE";
  const isArchived = status === "ARCHIVED";
  const busy = updateStatus.isPending || smartRun.isPending || archiveCampaign.isPending;

  const run = async () => {
    setError("");
    try {
      if (confirming === "golive") {
        await smartRun.mutateAsync({ adId: id, campaignId });
      } else if (confirming === "archive") {
        if (level === "campaign") await archiveCampaign.mutateAsync(id);
        else await updateStatus.mutateAsync({ id, level, status: "ARCHIVED", campaignId });
      } else {
        await updateStatus.mutateAsync({ id, level, status: confirming === "resume" ? "ACTIVE" : "PAUSED", campaignId });
      }
      setConfirming(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {showGoLive && !isActive && (
          <Button size="sm" variant="secondary" onClick={() => setConfirming("golive")}>
            Go Live (pause others)
          </Button>
        )}
        {!isArchived &&
          (isActive ? (
            <Button size="sm" variant="outline" onClick={() => setConfirming("pause")}>Pause</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setConfirming("resume")}>Resume</Button>
          ))}
        {!isArchived && (
          <Button size="sm" variant="outline" className="text-danger border-danger/30 hover:bg-danger-bg" onClick={() => setConfirming("archive")}>
            Archive
          </Button>
        )}
      </div>

      {confirming && (
        <ConfirmModal
          open
          onOpenChange={(o) => {
            if (o || busy) return;
            setConfirming(null);
            setError("");
          }}
          title={CONFIRM_COPY[confirming].title}
          description={CONFIRM_COPY[confirming].description}
          confirmLabel={CONFIRM_COPY[confirming].confirmLabel}
          variant={CONFIRM_COPY[confirming].variant}
          loading={busy}
          error={error}
          onConfirm={run}
        />
      )}
    </>
  );
}
