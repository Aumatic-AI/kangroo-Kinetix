"use client";
import { ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { LeadStatus, LEAD_STATUSES, LEAD_STATUS_LABEL, useUpdateLeadStatus } from "../../hooks/useLeads";

const STATUS_STYLE: Record<LeadStatus, string> = {
  new: "text-muted bg-surface border-default",
  contacted: "text-info bg-info-bg border-default",
  qualified: "text-warning bg-warning-bg border-warning-border",
  converted: "text-success bg-success-bg border-success-border",
  not_interested: "text-danger bg-danger-bg border-danger-border",
};

/** The status pill shown for a lead — also its own change-status control
 * (a dropdown of the other statuses), reused in both LeadsTable and
 * LeadDetailsModal so there's exactly one place this behavior lives. */
export function LeadStatusControl({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const updateStatus = useUpdateLeadStatus();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={updateStatus.isPending}
        className={`inline-flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border whitespace-nowrap transition-opacity disabled:opacity-60 ${STATUS_STYLE[status]}`}
      >
        {LEAD_STATUS_LABEL[status]}
        <ChevronDown className="w-3 h-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {LEAD_STATUSES.map((s) => (
          <DropdownMenuItem key={s} onClick={() => s !== status && updateStatus.mutate({ id: leadId, status: s })}>
            {LEAD_STATUS_LABEL[s]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
