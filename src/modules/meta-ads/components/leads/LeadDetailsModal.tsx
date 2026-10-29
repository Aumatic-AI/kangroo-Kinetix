"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/Avatar";
import { formatDateTime } from "@/utils/datetime";
import { InfoItem } from "../campaigns/shared";
import { LeadStatusControl } from "./LeadStatusControl";
import { Lead, useLeadForms } from "../../hooks/useLeads";

const NAME_KEYS = ["full_name", "first_name"];

function pick(fieldData: Record<string, string>, keys: string[]): string {
  for (const key of keys) if (fieldData[key]) return fieldData[key];
  return "—";
}

/** Instant Form field names come back as raw snake_case (e.g.
 * "preferred_event_date") — this is just for display, the real key is
 * still used to read from field_data. Applied uniformly to every field
 * (including the standard full_name/email/phone_number ones) so the Form
 * Answers section always matches exactly what the form actually asked. */
function fieldLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Everything this lead actually submitted, laid out clearly and in full —
 * no truncation, since this is the one place meant to show the complete
 * picture. Every field_data entry gets its own row in "Form Answers" (no
 * special-casing name/email/phone vs custom questions — whatever the form
 * asked is what shows up here), separate from "Source", which is about
 * where the lead came from rather than what they said. Every lead here
 * came in through the same channel: a native Meta Instant Form submission
 * (this app has no way to capture a website-form submission). */
export function LeadDetailsModal({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const { data: forms } = useLeadForms();
  const name = lead ? pick(lead.field_data, NAME_KEYS) : "";
  const formName = lead?.meta_form_id ? forms?.find((f) => f.id === lead.meta_form_id)?.name : undefined;
  const answers = lead ? Object.entries(lead.field_data) : [];

  return (
    <Dialog open={!!lead} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar label={name} />
              <div className="min-w-0">
                <DialogTitle className="truncate">{name}</DialogTitle>
                {lead && <p className="text-xs text-muted mt-0.5">Submitted {formatDateTime(lead.created_at)}</p>}
              </div>
            </div>
            {lead && <LeadStatusControl leadId={lead.id} status={lead.status} />}
          </div>
        </DialogHeader>

        {lead && (
          <div className="space-y-4">
            {answers.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-bold text-muted uppercase tracking-wide">Form Answers</p>
                <div className="grid grid-cols-2 gap-4">
                  {answers.map(([key, value]) => (
                    <InfoItem key={key} label={fieldLabel(key)} value={value} truncate={false} />
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-border space-y-3">
              <p className="text-xs font-bold text-muted uppercase tracking-wide">Source</p>
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Instant Form" value={formName || "—"} truncate={false} />
                <InfoItem label="Campaign" value={lead.campaign_name || "—"} truncate={false} />
                <InfoItem label="Ad Set" value={lead.adset_name || "—"} truncate={false} />
                <InfoItem label="Ad" value={lead.ad_name || "—"} truncate={false} />
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
