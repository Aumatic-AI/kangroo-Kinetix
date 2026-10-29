"use client";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Search, Check, X, Upload } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { BusinessServiceInput } from "../types/settings.types";
import { useUploadVideoReference, useUploadLogo } from "../hooks/useSettings";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-muted uppercase tracking-wide">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

/** Add-a-tag-and-press-Enter chip input for a plain string[] field
 * (target countries, competitor keywords). */
export function TagInput({ values, onChange, placeholder }: { values: string[]; onChange: (next: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && !values.includes(trimmed)) onChange([...values, trimmed]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-xs font-bold bg-secondary text-text border border-border">
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="hover:bg-secondary-hover rounded-full p-0.5">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
        }}
        onBlur={commit}
        placeholder={placeholder || "Type and press Enter"}
      />
    </div>
  );
}

export function ServicesEditor({ services, onChange }: { services: BusinessServiceInput[]; onChange: (next: BusinessServiceInput[]) => void }) {
  const update = (i: number, patch: Partial<BusinessServiceInput>) => onChange(services.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const remove = (i: number) => onChange(services.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      {services.map((s, i) => (
        <div key={i} className="flex gap-2 items-start">
          <div className="flex-1 grid grid-cols-2 gap-2">
            <Input value={s.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Service name" />
            <Input value={s.description || ""} onChange={(e) => update(i, { description: e.target.value })} placeholder="Description (optional)" />
          </div>
          <button type="button" onClick={() => remove(i)} title="Remove" className="text-muted hover:text-danger p-2.5 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...services, { name: "", description: "" }])} className="text-xs font-semibold text-primary hover:underline">
        + Add another service
      </button>
    </div>
  );
}

/** A curated set of common IANA zones rather than the full ~400-zone list —
 * anchored on Canada/US (this business's markets), plus a handful of other
 * major regions. "America/Detroit" is included specifically because it's the
 * hardcoded fallback used elsewhere (send-campaign.ts, /api/settings) — it
 * must be a valid selectable value so a business that's never set this
 * explicitly doesn't show a blank picker. */
export const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (New York, US)" },
  { value: "America/Detroit", label: "Eastern Time (Detroit, US)" },
  { value: "America/Chicago", label: "Central Time (Chicago, US)" },
  { value: "America/Denver", label: "Mountain Time (Denver, US)" },
  { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles, US)" },
  { value: "America/Toronto", label: "Eastern Time (Toronto, Canada)" },
  { value: "America/Winnipeg", label: "Central Time (Winnipeg, Canada)" },
  { value: "America/Edmonton", label: "Mountain Time (Edmonton, Canada)" },
  { value: "America/Vancouver", label: "Pacific Time (Vancouver, Canada)" },
  { value: "Europe/London", label: "London (UK)" },
  { value: "Europe/Paris", label: "Paris (France)" },
  { value: "Europe/Berlin", label: "Berlin (Germany)" },
  { value: "Europe/Madrid", label: "Madrid (Spain)" },
  { value: "Asia/Dubai", label: "Dubai (UAE)" },
  { value: "Asia/Kolkata", label: "India (Kolkata)" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Tokyo", label: "Tokyo (Japan)" },
  { value: "Australia/Sydney", label: "Sydney (Australia)" },
  { value: "UTC", label: "UTC" },
];

/** Searchable timezone picker — type to filter by country/city/zone name,
 * click to select. Local, synchronous filtering (unlike LocationSearch's
 * debounced API search) since TIMEZONES is a small fixed array, not a live
 * Graph API lookup. */
export function TimezoneSelect({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) { setOpen(false); setQuery(""); }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const selectedLabel = TIMEZONES.find((t) => t.value === value)?.label || value;
  const q = query.trim().toLowerCase();
  const filtered = q ? TIMEZONES.filter((t) => t.label.toLowerCase().includes(q) || t.value.toLowerCase().includes(q)) : TIMEZONES;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-[46px] w-full items-center justify-between rounded-lg border border-border bg-background px-4 text-sm text-left text-text transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
      >
        <span className="truncate">{selectedLabel}</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-background shadow-md overflow-hidden">
          <div className="relative border-b border-border">
            <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country or city…"
              className="w-full h-10 pl-9 pr-3 text-sm bg-transparent text-text focus:outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-3 text-xs text-muted">No matches for &quot;{query}&quot;.</p>
            ) : (
              filtered.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => { onChange(t.value); setOpen(false); setQuery(""); }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface transition-colors"
                >
                  <span className="truncate text-text">{t.label}</span>
                  {t.value === value && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

export function WeekdayToggle({ selected, onToggle }: { selected: number[]; onToggle: (day: number) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {WEEKDAYS.map((d) => (
        <button
          key={d.value}
          type="button"
          onClick={() => onToggle(d.value)}
          className={`w-11 h-9 rounded-lg text-xs font-bold border transition-colors ${selected.includes(d.value) ? "bg-info border-info" : "border-default text-muted hover:bg-surface"}`}
        >
          {d.label}
        </button>
      ))}
    </div>
  );
}

/** One male/female reference-photo upload slot for the Video Character
 * Reference section — uploads immediately on file pick (a real file
 * upload, not a form field, so it doesn't wait for the page's Save bar).
 * The mutation invalidates the settings query on success, so `url` (read
 * from the query's data, not the page's editable form copy) updates on
 * its own once the refetch lands — no local state to reconcile here. */
export function VideoReferenceUploader({ gender, label, url }: { gender: "male" | "female"; label: string; url: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadVideoReference();
  const [error, setError] = useState("");

  const handlePick = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    try {
      await uploadMutation.mutateAsync({ gender, file });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-muted uppercase tracking-wide">{label}</label>
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-lg border border-border bg-surface overflow-hidden shrink-0 flex items-center justify-center">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="w-full h-full object-cover" />
          ) : (
            <Upload className="w-4 h-4 text-muted" />
          )}
        </div>
        <div className="space-y-1">
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploadMutation.isPending}>
            {uploadMutation.isPending ? <Loader size="sm" /> : url ? "Replace" : "Upload"}
          </Button>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handlePick(e.target.files?.[0])} />
      </div>
    </div>
  );
}

/** Business logo upload — same upload-on-pick pattern as
 * VideoReferenceUploader, but a single slot with no gender split. Used on
 * AI Ad Studio poster-style ads when the business has one set. */
export function LogoUploader({ url }: { url: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadLogo();
  const [error, setError] = useState("");

  const handlePick = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    try {
      await uploadMutation.mutateAsync(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-muted uppercase tracking-wide">Logo</label>
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-lg border border-border bg-surface overflow-hidden shrink-0 flex items-center justify-center">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="w-full h-full object-contain" />
          ) : (
            <Upload className="w-4 h-4 text-muted" />
          )}
        </div>
        <div className="space-y-1">
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploadMutation.isPending}>
            {uploadMutation.isPending ? <Loader size="sm" /> : url ? "Replace" : "Upload"}
          </Button>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handlePick(e.target.files?.[0])} />
      </div>
      <p className="text-[11px] text-muted">Optional — shown on AI Ad Studio poster-style ads when it fits the design.</p>
    </div>
  );
}
