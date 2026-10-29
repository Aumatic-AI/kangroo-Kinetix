"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pause, Play, Send, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/Pagination";
import { PAGE_SIZE_COMPACT } from "@/lib/pagination";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import {
  useOutreachCampaigns,
  useDeleteOutreachCampaign,
  usePauseOutreachCampaign,
  useResumeOutreachCampaign,
  useSendOutreachCampaign,
  useCampaignSendPreview,
} from "../hooks/useCampaigns";
import { OutreachCampaignListItem } from "../types/outreach.types";
import { ROUTES } from "@/config/routes";

// Table rows — compact page size.
const PAGE_SIZE = PAGE_SIZE_COMPACT;

const TONE_STYLE: Record<string, string> = {
  success: "text-success bg-success-bg",
  warning: "text-warning bg-warning-bg",
  danger: "text-danger bg-danger-bg",
  muted: "text-muted bg-surface",
};

type ConfirmType = "delete" | "pause" | "resume" | "send";

const CONFIRM_COPY: Record<Exclude<ConfirmType, "send">, { title: string; description: (name: string) => string; confirmLabel: string; variant: "primary" | "destructive" }> = {
  delete: {
    title: "Delete this draft?",
    description: (name) => `"${name}" and its draft content will be permanently deleted. This can't be undone.`,
    confirmLabel: "Delete",
    variant: "destructive",
  },
  pause: {
    title: "Pause this campaign?",
    description: (name) => `"${name}" will stop sending on Instantly immediately. You can resume it later.`,
    confirmLabel: "Pause",
    variant: "primary",
  },
  resume: {
    title: "Resume this campaign?",
    description: (name) => `"${name}" will start sending on Instantly again.`,
    confirmLabel: "Resume",
    variant: "primary",
  },
};

/** Mirrors the campaigns table's real columns exactly — only the body
 * shimmers, the header renders immediately since its labels are already
 * known. The Avatar slot uses a plain Skeleton (not the real Avatar with an
 * empty label, which would render a literal "?" glyph). */
function OutreachCampaignsTableSkeleton() {
  return (
    <div className="border border-default rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Sent</TableHead>
            <TableHead className="text-right">Opened</TableHead>
            <TableHead className="text-right">Replied</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3].map((i) => (
            <TableRow key={i}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
                  <Skeleton className="h-3.5 w-32 rounded" />
                </div>
              </TableCell>
              <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
              <TableCell className="text-right"><Skeleton className="h-3.5 w-6 rounded ml-auto" /></TableCell>
              <TableCell className="text-right"><Skeleton className="h-3.5 w-6 rounded ml-auto" /></TableCell>
              <TableCell className="text-right"><Skeleton className="h-3.5 w-6 rounded ml-auto" /></TableCell>
              <TableCell>
                <div className="flex items-center gap-2 justify-end">
                  <Skeleton className="h-3.5 w-3.5 rounded" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface ModalCopy {
  title: string;
  description: string;
  confirmLabel: string;
  variant: "primary" | "destructive";
}

function getModalCopy(target: { type: ConfirmType; campaign: OutreachCampaignListItem } | null): ModalCopy | null {
  if (!target) return null;
  if (target.type === "send") {
    return { title: "Send this campaign?", description: `"${target.campaign.name}" will be sent via Instantly.`, confirmLabel: "Send", variant: "primary" };
  }
  const copy = CONFIRM_COPY[target.type];
  return { ...copy, description: copy.description(target.campaign.name) };
}

export function CampaignsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useOutreachCampaigns(page, PAGE_SIZE);
  const campaigns = data?.campaigns || [];

  const deleteCampaign = useDeleteOutreachCampaign();
  const pauseCampaign = usePauseOutreachCampaign();
  const resumeCampaign = useResumeOutreachCampaign();
  const sendCampaign = useSendOutreachCampaign();

  const [confirmTarget, setConfirmTarget] = useState<{ type: ConfirmType; campaign: OutreachCampaignListItem } | null>(null);
  const [confirmError, setConfirmError] = useState("");

  const sendPreviewId = confirmTarget?.type === "send" ? confirmTarget.campaign.id : null;
  const { data: sendPreview, isLoading: sendPreviewLoading } = useCampaignSendPreview(sendPreviewId);

  const openCampaign = (id: string) => router.push(ROUTES.OUTREACH.CAMPAIGN_DETAIL(id));

  const openConfirm = (type: ConfirmType, campaign: OutreachCampaignListItem) => {
    setConfirmError("");
    setConfirmTarget({ type, campaign });
  };

  const closeConfirm = () => {
    setConfirmTarget(null);
    setConfirmError("");
  };

  const isActing = deleteCampaign.isPending || pauseCampaign.isPending || resumeCampaign.isPending || sendCampaign.isPending;

  const handleConfirm = async () => {
    if (!confirmTarget) return;
    setConfirmError("");
    try {
      const id = confirmTarget.campaign.id;
      if (confirmTarget.type === "delete") await deleteCampaign.mutateAsync(id);
      else if (confirmTarget.type === "pause") await pauseCampaign.mutateAsync(id);
      else if (confirmTarget.type === "resume") await resumeCampaign.mutateAsync(id);
      else await sendCampaign.mutateAsync({ id });
      setConfirmTarget(null);
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : "Something went wrong — please try again.");
    }
  };

  const modalCopy = getModalCopy(confirmTarget);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-text">Campaigns</h2>
          <p className="text-sm text-muted mt-1">Draft, review, and send outreach emails.</p>
        </div>
        <Button onClick={() => router.push(ROUTES.OUTREACH.CAMPAIGN_NEW)} icon={<Plus className="w-4 h-4" />}>New Campaign</Button>
      </div>

      {isLoading ? (
        <OutreachCampaignsTableSkeleton />
      ) : campaigns.length === 0 ? (
        <div className="py-16 text-center text-muted border border-default rounded-2xl border-dashed text-sm">No campaigns yet.</div>
      ) : (
        <>
        <div className="border border-default rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Opened</TableHead>
                <TableHead className="text-right">Replied</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => {
                const showNumbers = c.status !== "draft" && c.status !== "ready";
                return (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => openCampaign(c.id)}>
                    <TableCell className="font-semibold text-text">
                      <div className="flex items-center gap-3">
                        <Avatar icon={Megaphone} />
                        <span>{c.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${TONE_STYLE[c.statusTone]}`}
                        title={c.statusReason}
                      >
                        {c.statusLabel}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-text">{showNumbers ? c.sent : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-text">{showNumbers ? c.opened : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-text">{showNumbers ? c.replied : "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 justify-end">
                        {c.status === "ready" && (
                          <Button size="sm" onClick={(e) => { e.stopPropagation(); openConfirm("send", c); }} icon={<Send className="w-3.5 h-3.5" />}>Send</Button>
                        )}
                        {!c.externalCampaignId ? (
                          <button onClick={(e) => { e.stopPropagation(); openConfirm("delete", c); }} className="text-muted hover:text-danger" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : c.status === "paused" ? (
                          <button onClick={(e) => { e.stopPropagation(); openConfirm("resume", c); }} className="text-muted hover:text-success" title="Resume">
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); openConfirm("pause", c); }} className="text-muted hover:text-warning" title="Pause">
                            <Pause className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <Pagination page={page} totalPages={data?.totalPages || 1} onPageChange={setPage} />
        </>
      )}

      <ConfirmModal
        open={!!confirmTarget}
        onOpenChange={(open) => !open && closeConfirm()}
        title={modalCopy?.title || ""}
        description={modalCopy?.description || ""}
        confirmLabel={modalCopy?.confirmLabel || ""}
        variant={modalCopy?.variant || "primary"}
        loading={isActing}
        error={confirmError}
        onConfirm={handleConfirm}
        details={
          confirmTarget?.type === "send" ? (
            sendPreviewLoading ? (
              <p className="text-xs text-muted">Loading recipient details…</p>
            ) : sendPreview ? (
              <dl className="text-sm bg-surface/60 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between"><dt className="text-muted">List</dt><dd className="font-semibold text-text">{sendPreview.listName}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Eligible leads</dt><dd className="font-semibold text-text">{sendPreview.eligibleLeads}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Will send this run</dt><dd className="font-semibold text-text">{Math.min(sendPreview.eligibleLeads, sendPreview.dailyLimit)} (daily limit {sendPreview.dailyLimit})</dd></div>
                {confirmTarget.campaign.goal && (
                  <div className="flex justify-between gap-4"><dt className="text-muted shrink-0">Goal</dt><dd className="text-text text-right">{confirmTarget.campaign.goal}</dd></div>
                )}
              </dl>
            ) : null
          ) : undefined
        }
      />
    </div>
  );
}
