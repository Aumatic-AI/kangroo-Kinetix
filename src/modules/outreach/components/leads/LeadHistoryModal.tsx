"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatDate } from "@/utils/datetime";
import { useLeadCampaignHistory } from "../../hooks/useLeads";

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  sent: "Sent",
  failed: "Failed",
};

/** Read-only — which campaigns a lead has been queued for, and when. Built
 * entirely from our own outreach_campaign_leads records, not a live
 * Instantly lookup, so it's fast and doesn't depend on the ESP being up. */
export function LeadHistoryModal({ leadId, leadName, onClose }: { leadId: string | null; leadName: string; onClose: () => void }) {
  const { data: history, isLoading } = useLeadCampaignHistory(leadId);

  return (
    <Dialog open={!!leadId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{leadName} — campaign history</DialogTitle>
          <DialogDescription>Every campaign this lead has been queued for.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-10 rounded-lg bg-surface animate-pulse" />)}</div>
        ) : !history || history.length === 0 ? (
          <p className="text-sm text-muted py-6 text-center">Not part of any campaign yet.</p>
        ) : (
          <div className="divide-y divide-border max-h-80 overflow-y-auto">
            {history.map((h) => (
              <div key={h.campaignId} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text">{h.campaignName}</p>
                  <p className="text-xs text-muted">{h.sentAt ? formatDate(h.sentAt) : "Not sent yet"}</p>
                </div>
                <span className="text-xs font-bold uppercase tracking-wide text-muted shrink-0">{STATUS_LABEL[h.status] || h.status}</span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
