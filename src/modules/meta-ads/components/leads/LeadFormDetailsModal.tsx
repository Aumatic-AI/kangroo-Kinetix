"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Section, InfoItem, StatusChip } from "../campaigns/shared";
import { localeLabel } from "./shared";
import { formatDate } from "@/utils/datetime";
import { LeadForm } from "../../hooks/useLeads";

const STANDARD_LABELS: Record<string, string> = {
  FULL_NAME: "Full Name", FIRST_NAME: "First Name", LAST_NAME: "Last Name", EMAIL: "Email", PHONE: "Phone Number",
  CITY: "City", STATE: "State/Province", COUNTRY: "Country", ZIP_CODE: "Zip/Postal Code", STREET_ADDRESS: "Street Address",
  DOB: "Date of Birth", GENDER: "Gender", COMPANY_NAME: "Company Name", JOB_TITLE: "Job Title",
  WORK_EMAIL: "Work Email", WORK_PHONE_NUMBER: "Work Phone Number",
};

function questionLabel(q: { type: string; label?: string }): string {
  if (q.type === "CUSTOM") return q.label || "Custom question";
  return STANDARD_LABELS[q.type] || q.type;
}

function UrlLink({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
      {url}
    </a>
  );
}

/** Read-only — everything Meta has on record for this form. Meta doesn't
 * support editing a form's questions/content after creation (same
 * immutability as ad creatives), so this is the only view available;
 * there's no "Edit" path to offer instead. */
export function LeadFormDetailsModal({ form, onClose }: { form: LeadForm | null; onClose: () => void }) {
  return (
    <Dialog open={!!form} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl sm:max-w-2xl bg-background border-border text-text p-0 sm:rounded-xl gap-0 overflow-hidden outline-none flex flex-col max-h-[85vh] shadow-lg">
        <DialogHeader className="px-6 py-5 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <DialogTitle className="truncate">{form?.name}</DialogTitle>
            {form && <StatusChip status={form.status} />}
          </div>
        </DialogHeader>

        {form && (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <Section title="Basics">
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Leads Collected" value={form.leads_count != null ? String(form.leads_count) : "—"} />
                <InfoItem label="Language" value={localeLabel(form.locale)} />
                <InfoItem label="Created" value={form.created_time ? formatDate(form.created_time) : "—"} />
              </div>
            </Section>

            <Section title="Questions">
              {form.questions && form.questions.length > 0 ? (
                <ul className="space-y-1.5">
                  {form.questions.map((q, i) => (
                    <li key={i} className="text-sm text-text flex items-start gap-2">
                      <span className="text-muted">•</span>
                      <span>{questionLabel(q)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No questions on record.</p>
              )}
            </Section>

            <Section title="Privacy Policy">
              <InfoItem label="URL" value={form.privacy_policy_url ? <UrlLink url={form.privacy_policy_url} /> : "—"} truncate={false} />
            </Section>

            {form.context_card?.title && (
              <Section title="Intro Screen">
                <div className="space-y-2">
                  <InfoItem label="Title" value={form.context_card.title} truncate={false} />
                  {form.context_card.content && form.context_card.content.length > 0 && (
                    <ul className="space-y-1">
                      {form.context_card.content.map((line, i) => (
                        <li key={i} className="text-sm text-text flex items-start gap-2">
                          <span className="text-muted">•</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {form.context_card.button_text && <InfoItem label="Button Text" value={form.context_card.button_text} />}
                </div>
              </Section>
            )}

            <Section title="Thank-You Screen">
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Title" value={form.thank_you_page?.title || "—"} truncate={false} />
                <InfoItem label="Body" value={form.thank_you_page?.body || "—"} truncate={false} />
                <InfoItem label="Button" value={form.thank_you_page?.button_type === "NONE" ? "No Button" : form.thank_you_page?.button_text || "Visit Website"} />
                {form.thank_you_page?.website_url && <InfoItem label="Website URL" value={<UrlLink url={form.thank_you_page.website_url} />} truncate={false} />}
              </div>
            </Section>

            <Section title="Lead Quality">
              <InfoItem label="Optimized for Quality" value={form.is_optimized_for_quality ? "On" : "Off"} />
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
