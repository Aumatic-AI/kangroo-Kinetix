"use client";
import { ReactNode, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import { Dropdown } from "@/components/ui/Dropdown";
import { Section, PillToggle } from "../campaigns/shared";
import { LOCALES } from "./shared";
import { useCreateLeadForm, CreateLeadFormInput } from "../../hooks/useLeads";

const STANDARD_QUESTIONS = [
  { value: "FULL_NAME", label: "Full Name" },
  { value: "FIRST_NAME", label: "First Name" },
  { value: "LAST_NAME", label: "Last Name" },
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Phone Number" },
  { value: "CITY", label: "City" },
  { value: "STATE", label: "State/Province" },
  { value: "COUNTRY", label: "Country" },
  { value: "ZIP_CODE", label: "Zip/Postal Code" },
  { value: "STREET_ADDRESS", label: "Street Address" },
  { value: "DOB", label: "Date of Birth" },
  { value: "GENDER", label: "Gender" },
  { value: "COMPANY_NAME", label: "Company Name" },
  { value: "JOB_TITLE", label: "Job Title" },
  { value: "WORK_EMAIL", label: "Work Email" },
  { value: "WORK_PHONE_NUMBER", label: "Work Phone Number" },
];

const DEFAULT_FORM: CreateLeadFormInput = {
  name: "",
  standardQuestions: ["FULL_NAME", "EMAIL", "PHONE"],
  customQuestions: [],
  privacyPolicyUrl: "",
  privacyPolicyLinkText: "Privacy Policy",
  locale: "EN_US",
  contextCardEnabled: false,
  contextCardTitle: "",
  contextCardContent: "",
  contextCardButtonText: "Continue",
  thankYouButtonType: "VIEW_WEBSITE",
  thankYouTitle: "Thank you!",
  thankYouBody: "We'll be in touch soon.",
  thankYouWebsiteUrl: "",
  thankYouButtonText: "Visit Website",
  isOptimizedForQuality: true,
};

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-muted uppercase tracking-wide">
        {label} {required ? <span className="text-danger">*</span> : <span className="normal-case font-medium text-muted">(optional)</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

/**
 * "New Instant Form" — every field Meta's Lead Form API accepts that's
 * actually worth exposing (see the chat where this was scoped: skipped
 * question_page_custom_disclaimer since its wire format is the least
 * documented/most failure-prone part of this API, and privacy_policy
 * already covers the compliance need for most forms). Required fields get
 * a red asterisk; everything else is explicitly labeled "(optional)".
 */
export function CreateLeadFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createForm = useCreateLeadForm();
  const [form, setForm] = useState<CreateLeadFormInput>(DEFAULT_FORM);
  const [customDraft, setCustomDraft] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(DEFAULT_FORM);
    setCustomDraft("");
    setError("");
  }, [open]);

  const patch = (p: Partial<CreateLeadFormInput>) => setForm((prev) => ({ ...prev, ...p }));
  const toggleStandard = (value: string) =>
    patch({ standardQuestions: form.standardQuestions.includes(value) ? form.standardQuestions.filter((v) => v !== value) : [...form.standardQuestions, value] });

  const addCustomQuestion = () => {
    if (!customDraft.trim()) return;
    patch({ customQuestions: [...form.customQuestions, customDraft.trim()] });
    setCustomDraft("");
  };
  const removeCustomQuestion = (i: number) => patch({ customQuestions: form.customQuestions.filter((_, idx) => idx !== i) });

  const handleCreate = async () => {
    setError("");
    if (!form.name.trim()) return setError("Form name is required.");
    if (form.standardQuestions.length === 0 && form.customQuestions.length === 0) return setError("At least one question is required.");
    if (!form.privacyPolicyUrl.trim()) return setError("Privacy Policy URL is required.");
    if (form.thankYouButtonType === "VIEW_WEBSITE" && !form.thankYouWebsiteUrl?.trim()) return setError("Thank-you page website URL is required when the button type is “Visit Website.”");

    try {
      await createForm.mutateAsync(form);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create form");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl sm:max-w-2xl bg-background border-border text-text p-0 sm:rounded-xl gap-0 overflow-hidden outline-none flex flex-col h-[85vh] shadow-lg">
        <DialogHeader className="px-6 py-5 border-b border-border shrink-0">
          <DialogTitle>New Instant Form</DialogTitle>
          <p className="text-xs text-muted">Created directly on Meta — required fields are marked, everything else is optional.</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <Section title="Basics" description="The form's internal name and the questions it asks.">
            <div className="space-y-4">
              <Field label="Form Name" required>
                <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="e.g. Venue Booking Enquiry" />
              </Field>

              <Field label="Standard Questions" required hint="Select at least one — or add a custom question below.">
                <PillToggle options={STANDARD_QUESTIONS} selected={form.standardQuestions} onToggle={toggleStandard} />
              </Field>

              <Field label="Custom Questions">
                <div className="space-y-2">
                  {form.customQuestions.length > 0 && (
                    <div className="space-y-2">
                      {form.customQuestions.map((q, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="flex-1 text-sm text-text bg-surface border border-border rounded-lg px-3 py-2">{q}</span>
                          <button type="button" onClick={() => removeCustomQuestion(i)} title="Remove" className="text-muted hover:text-danger p-1.5">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={customDraft}
                      onChange={(e) => setCustomDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomQuestion(); } }}
                      placeholder="e.g. Preferred event date"
                    />
                    <Button type="button" variant="outline" onClick={addCustomQuestion}>Add</Button>
                  </div>
                </div>
              </Field>
            </div>
          </Section>

          <Section title="Privacy & Language" description="Required by Meta on every Instant Form.">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Field label="Privacy Policy URL" required>
                  <Input value={form.privacyPolicyUrl} onChange={(e) => patch({ privacyPolicyUrl: e.target.value })} placeholder="https://example.com/privacy-policy" />
                </Field>
              </div>
              <Field label="Privacy Policy Link Text">
                <Input value={form.privacyPolicyLinkText} onChange={(e) => patch({ privacyPolicyLinkText: e.target.value })} />
              </Field>
              <Field label="Language">
                <Dropdown value={form.locale} onValueChange={(locale) => patch({ locale })} options={LOCALES} />
              </Field>
            </div>
          </Section>

          <Section title="Intro Screen" description="An optional screen shown before the questions, describing the offer.">
            <label className="flex items-start gap-2.5 cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={form.contextCardEnabled}
                onChange={(e) => patch({ contextCardEnabled: e.target.checked })}
                className="mt-0.5 w-4 h-4 rounded border-border accent-primary"
              />
              <span className="text-xs text-text">
                <span className="font-semibold">Show an intro screen</span>
                <span className="block text-muted">A title and a few bullet points before the person starts answering questions.</span>
              </span>
            </label>
            {form.contextCardEnabled && (
              <div className="space-y-4">
                <Field label="Intro Title" required>
                  <Input value={form.contextCardTitle} onChange={(e) => patch({ contextCardTitle: e.target.value })} placeholder="e.g. See if you qualify" />
                </Field>
                <Field label="Intro Content" hint="One point per line — shown as a bulleted list.">
                  <Textarea value={form.contextCardContent} onChange={(e) => patch({ contextCardContent: e.target.value })} rows={3} placeholder={"Free consultation\nNo obligation\nResults in 24 hours"} />
                </Field>
                <Field label="Button Text">
                  <Input value={form.contextCardButtonText} onChange={(e) => patch({ contextCardButtonText: e.target.value })} />
                </Field>
              </div>
            )}
          </Section>

          <Section title="Thank-You Screen" description="Shown immediately after the person submits the form.">
            <div className="space-y-4">
              <Field label="Button">
                <Dropdown
                  value={form.thankYouButtonType}
                  onValueChange={(v) => patch({ thankYouButtonType: v as "VIEW_WEBSITE" | "NONE" })}
                  options={[{ value: "VIEW_WEBSITE", label: "Visit Website" }, { value: "NONE", label: "No Button" }]}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Title">
                  <Input value={form.thankYouTitle} onChange={(e) => patch({ thankYouTitle: e.target.value })} />
                </Field>
                <Field label="Body">
                  <Input value={form.thankYouBody} onChange={(e) => patch({ thankYouBody: e.target.value })} />
                </Field>
              </div>
              {form.thankYouButtonType === "VIEW_WEBSITE" && (
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Website URL" required>
                    <Input value={form.thankYouWebsiteUrl} onChange={(e) => patch({ thankYouWebsiteUrl: e.target.value })} placeholder="https://example.com/thank-you" />
                  </Field>
                  <Field label="Button Text">
                    <Input value={form.thankYouButtonText} onChange={(e) => patch({ thankYouButtonText: e.target.value })} />
                  </Field>
                </div>
              )}
            </div>
          </Section>

          <Section title="Lead Quality" description="Meta's own filtering for likely-fake or low-quality submissions.">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isOptimizedForQuality}
                onChange={(e) => patch({ isOptimizedForQuality: e.target.checked })}
                className="mt-0.5 w-4 h-4 rounded border-border accent-primary"
              />
              <span className="text-xs text-text">
                <span className="font-semibold">Optimize for lead quality</span>
                <span className="block text-muted">Recommended — lets Meta filter out low-intent and likely-fake submissions before they reach you.</span>
              </span>
            </label>
          </Section>

          {error && <p className="text-sm text-danger font-medium">{error}</p>}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0 sm:justify-between">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} loading={createForm.isPending}>{createForm.isPending ? "Creating…" : "Create Form"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
