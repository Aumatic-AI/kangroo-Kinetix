"use client";
import { useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Play, Send, Loader2 } from "lucide-react";
import { useOutreachCampaign, useResumeOutreachCampaign, useSendOutreachCampaign, useCampaignSendPreview } from "../../hooks/useCampaigns";
import { CampaignDraftPanel } from "./CampaignDraftPanel";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ROUTES } from "@/config/routes";
import { formatDate } from "@/utils/datetime";
import { OutreachCampaignDetail } from "../../types/outreach.types";

const TONE_STYLE: Record<string, string> = {
  success: "text-success bg-success-bg",
  warning: "text-warning bg-warning-bg",
  danger: "text-danger bg-danger-bg",
  muted: "text-muted bg-surface",
};

const STATS: { key: keyof OutreachCampaignDetail; label: string; rateKey?: keyof OutreachCampaignDetail }[] = [
  { key: "sent", label: "Sent" },
  { key: "opened", label: "Opened", rateKey: "openRate" },
  { key: "replied", label: "Replied", rateKey: "replyRate" },
  { key: "clicked", label: "Clicked", rateKey: "clickRate" },
  { key: "bounced", label: "Bounced", rateKey: "bounceRate" },
];

function Field({ label, value, wide, truncate = true }: { label: string; value: string; wide?: boolean; truncate?: boolean }) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <p className="text-[10px] font-semibold text-muted uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-medium text-text mt-0.5 ${truncate ? "truncate" : ""}`}>{value}</p>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-default overflow-hidden">
      <div className="px-4 py-2 bg-surface/60">
        <p className="text-[11px] font-bold text-muted uppercase tracking-wide">{title}</p>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-4">{children}</div>
    </div>
  );
}

function CampaignMeta({ campaign }: { campaign: OutreachCampaignDetail }) {
  return (
    <InfoCard title="Campaign Details">
      <Field label="List" value={campaign.listName} wide truncate={false} />
      <Field label="Service" value={campaign.serviceType || "—"} />
      <Field label="Region" value={campaign.targetRegion || "—"} />
      <Field label="Daily limit" value={String(campaign.dailyLimit)} />
      <Field label="Goal" value={campaign.goal || "—"} wide />
      <Field label="Tone" value={campaign.tone || "—"} wide />
      {campaign.ctaText && <Field label="CTA" value={campaign.ctaText} wide />}
      <Field label="Created" value={formatDate(campaign.createdAt)} />
    </InfoCard>
  );
}

function CampaignStats({ campaign }: { campaign: OutreachCampaignDetail }) {
  return (
    <InfoCard title="Performance">
      {STATS.map((s) => (
        <div key={s.key} className="min-w-0">
          <p className="text-[10px] font-semibold text-muted uppercase tracking-wide">{s.label}</p>
          <p className="text-base font-bold text-text tabular-nums mt-0.5">
            {(campaign[s.key] as number).toLocaleString()}
            {s.rateKey && <span className="text-xs text-muted font-normal ml-1">({campaign[s.rateKey] as number}%)</span>}
          </p>
        </div>
      ))}
    </InfoCard>
  );
}

/** Mirrors the loaded layout exactly — left column's InfoCard shape
 * (CampaignMeta + CampaignStats) and the right column's EmailPreview shape
 * (header bar + iframe body) — so nothing reflows once the campaign loads. */
function CampaignDetailSkeleton() {
  const metaFields = [false, false, false, false, true, true, false];
  return (
    <div className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] gap-6 items-start">
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Skeleton className="h-7 w-40 rounded" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>

        <div className="rounded-xl border border-default overflow-hidden">
          <div className="px-4 py-2 bg-surface/60">
            <p className="text-[11px] font-bold text-muted uppercase tracking-wide">Campaign Details</p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-4">
            {metaFields.map((wide, i) => (
              <div key={i} className={wide ? "col-span-2 min-w-0 space-y-1.5" : "min-w-0 space-y-1.5"}>
                <Skeleton className="h-2.5 w-16 rounded" />
                <Skeleton className="h-3.5 w-24 rounded" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-default overflow-hidden">
          <div className="px-4 py-2 bg-surface/60">
            <p className="text-[11px] font-bold text-muted uppercase tracking-wide">Performance</p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="min-w-0 space-y-1.5">
                <Skeleton className="h-2.5 w-12 rounded" />
                <Skeleton className="h-4 w-10 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg overflow-hidden border border-default">
          <div className="px-4 py-2.5 border-b border-default bg-surface/60">
            <Skeleton className="h-2.5 w-14 rounded mb-1.5" />
            <Skeleton className="h-3.5 w-40 rounded" />
          </div>
          <Skeleton className="w-full rounded-none" style={{ height: 520 }} />
        </div>
        <div className="space-y-3">
          <Skeleton className="w-full rounded-lg" style={{ height: 60 }} />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-28 rounded-lg" />
            <Skeleton className="h-10 w-24 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  // Set once, right after a successful Send — starts a bounded polling
  // window (see useOutreachCampaign's own comment for why).
  const [pollUntil, setPollUntil] = useState<number | null>(null);
  const { data: campaign, isLoading } = useOutreachCampaign(id, pollUntil);
  // Doesn't re-check the deadline here (Date.now() isn't pure to call during
  // render) — the actual stop condition lives in useOutreachCampaign's own
  // refetchInterval; this is just the UI hint, which self-corrects once
  // that stops updating status away from "ready".
  const isSending = !!pollUntil && campaign?.status === "ready";

  const resumeCampaign = useResumeOutreachCampaign();
  const [confirmingResume, setConfirmingResume] = useState(false);
  const [resumeError, setResumeError] = useState("");

  const handleResume = async () => {
    if (!campaign) return;
    setResumeError("");
    try {
      await resumeCampaign.mutateAsync(campaign.id);
      setConfirmingResume(false);
    } catch (e) {
      setResumeError(e instanceof Error ? e.message : "Something went wrong — please try again.");
    }
  };

  const sendCampaign = useSendOutreachCampaign();
  const [confirmingSend, setConfirmingSend] = useState(false);
  const [sendError, setSendError] = useState("");
  const { data: sendPreview, isLoading: sendPreviewLoading } = useCampaignSendPreview(confirmingSend ? campaign?.id || null : null);

  const handleSend = async () => {
    if (!campaign) return;
    setSendError("");
    try {
      await sendCampaign.mutateAsync({ id: campaign.id });
      setConfirmingSend(false);
      setPollUntil(Date.now() + 45_000);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Something went wrong — please try again.");
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <Link href={ROUTES.OUTREACH.CAMPAIGNS} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
        <ArrowLeft className="w-4 h-4" /> Back to Campaigns
      </Link>

      {isLoading || !campaign ? (
        <CampaignDetailSkeleton />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] gap-6 items-start">
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-2xl font-bold text-text">{campaign.name}</h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${TONE_STYLE[campaign.statusTone]}`}>
                  {campaign.statusLabel}
                </span>
              </div>
              {campaign.statusReason && <p className="text-xs text-muted mt-1">{campaign.statusReason}</p>}
              {campaign.status === "ready" && isSending ? (
                <p className="flex items-center gap-1.5 text-xs text-muted mt-3">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending — this can take a few seconds…
                </p>
              ) : campaign.status === "ready" ? (
                <Button
                  size="sm"
                  className="mt-3"
                  onClick={() => { setSendError(""); setConfirmingSend(true); }}
                  icon={<Send className="w-3.5 h-3.5" />}
                >
                  Send
                </Button>
              ) : null}
              {campaign.status === "paused" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => { setResumeError(""); setConfirmingResume(true); }}
                  icon={<Play className="w-3.5 h-3.5" />}
                >
                  Resume
                </Button>
              )}
            </div>

            <CampaignMeta campaign={campaign} />

            {(campaign.status === "sending" || campaign.status === "sent" || campaign.status === "paused") && (
              <CampaignStats campaign={campaign} />
            )}
          </div>

          <CampaignDraftPanel campaign={campaign} />
        </div>
      )}

      <ConfirmModal
        open={confirmingResume}
        onOpenChange={(open) => { if (!open) { setConfirmingResume(false); setResumeError(""); } }}
        title="Resume this campaign?"
        description={campaign ? `"${campaign.name}" will start sending on Instantly again.` : ""}
        confirmLabel="Resume"
        loading={resumeCampaign.isPending}
        error={resumeError}
        onConfirm={handleResume}
      />

      <ConfirmModal
        open={confirmingSend}
        onOpenChange={(open) => { if (!open) { setConfirmingSend(false); setSendError(""); } }}
        title="Send this campaign?"
        description={campaign ? `"${campaign.name}" will be sent via Instantly.` : ""}
        confirmLabel="Send"
        loading={sendCampaign.isPending}
        error={sendError}
        onConfirm={handleSend}
        details={
          sendPreviewLoading ? (
            <p className="text-xs text-muted">Loading recipient details…</p>
          ) : sendPreview ? (
            <dl className="text-sm bg-surface/60 rounded-lg p-3 space-y-1.5">
              <div className="flex justify-between"><dt className="text-muted">List</dt><dd className="font-semibold text-text">{sendPreview.listName}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Eligible leads</dt><dd className="font-semibold text-text">{sendPreview.eligibleLeads}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Will send this run</dt><dd className="font-semibold text-text">{Math.min(sendPreview.eligibleLeads, sendPreview.dailyLimit)} (daily limit {sendPreview.dailyLimit})</dd></div>
              {campaign?.goal && (
                <div className="flex justify-between gap-4"><dt className="text-muted shrink-0">Goal</dt><dd className="text-text text-right">{campaign.goal}</dd></div>
              )}
            </dl>
          ) : null
        }
      />
    </div>
  );
}
