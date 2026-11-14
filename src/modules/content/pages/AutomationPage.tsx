"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Section } from "@/components/ui/Section";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/Switch";
import { ROUTES } from "@/config/routes";
import { Pill } from "@/modules/listings/components/ListingBits";
import { useAutomationSettings, useUpdateSettings } from "../hooks/useContent";

type FreqKey = "socialImageFrequency" | "socialVideoFrequency" | "linkedinFrequency" | "blogFrequency";

const FREQ_FIELDS: { key: FreqKey; label: string; hint: string }[] = [
  { key: "socialImageFrequency", label: "Social images per week", hint: "One 4:5 image, shared on TikTok, Instagram and Facebook." },
  { key: "socialVideoFrequency", label: "Social videos per week", hint: "One 30-second vertical video, shared on TikTok, Instagram and Facebook." },
  { key: "linkedinFrequency", label: "LinkedIn posts per week", hint: "Professional text + image. Never video." },
  { key: "blogFrequency", label: "Blog posts per week", hint: "A detailed article about one listing, with images. Display-only — never published." },
];

/**
 * Minimal on purpose (spec §18.3): weekly frequencies (social images and social
 * videos are set separately — the user picks the format), enable/pause, and
 * read-only state for the safeguards. Testing mode and "auto-run off" are
 * enforced by the API and database, not just shown here — Live mode and
 * automatic weekly runs cannot be selected during the testing phase.
 */
export function AutomationPage() {
  const { data: settings, isLoading, error } = useAutomationSettings();
  const update = useUpdateSettings();
  // Edits live in `draft` only until saved; the shown value falls back to the saved setting.
  const [draft, setDraft] = useState<Partial<Record<FreqKey, string>>>({});

  if (isLoading) {
    return <div className="max-w-2xl mx-auto space-y-6"><Skeleton className="h-8 w-48 rounded" /><Skeleton className="h-40 w-full rounded-lg" /><Skeleton className="h-40 w-full rounded-lg" /></div>;
  }
  if (error || !settings) {
    return <div className="max-w-2xl mx-auto py-16 text-center border border-default rounded-2xl border-dashed"><p className="text-sm text-danger font-medium">{error?.message ?? "Could not load settings"}</p></div>;
  }

  const saved = (k: FreqKey) => String(settings[k]);
  const value = (k: FreqKey) => draft[k] ?? saved(k);
  const valid = (v: string) => /^\d+$/.test(v) && Number(v) >= 0 && Number(v) <= 14;
  // Images and videos share the social pipeline's 14-per-week cap.
  const socialTotal = Number(value("socialImageFrequency")) + Number(value("socialVideoFrequency"));
  const socialOverCap = socialTotal > 14;
  const allValid = FREQ_FIELDS.every((f) => valid(value(f.key))) && !socialOverCap;
  const dirty = FREQ_FIELDS.some((f) => value(f.key) !== saved(f.key));
  const save = () => update.mutate(
    Object.fromEntries(FREQ_FIELDS.map((f) => [f.key, Number(value(f.key))])) as Record<FreqKey, number>,
    { onSuccess: () => setDraft({}) },
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      <div>
        <h2 className="text-2xl font-bold text-text">Automation</h2>
        <p className="text-sm text-muted mt-1">Set how often content is made, including how many social posts are images and how many are videos. The AI chooses the properties and (for social and LinkedIn) posting times.</p>
      </div>

      <Section title="Status" description="Generation only runs when enabled. Pausing stops new generation immediately.">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text">Generation {settings.isEnabled ? "enabled" : "paused"}</p>
            <p className="text-xs text-muted mt-0.5">{settings.canAdmin ? "Needed for Generate now to work." : "Only owners and admins can change this."}</p>
          </div>
          <Switch checked={settings.isEnabled} disabled={!settings.canAdmin || update.isPending} onCheckedChange={(isEnabled) => update.mutate({ isEnabled })} />
        </div>
        <div className="flex items-center justify-between gap-4 pt-3 border-t border-border">
          <div>
            <p className="text-sm font-medium text-text">Mode</p>
            <p className="text-xs text-muted mt-0.5">Testing keeps everything private in the gallery. Live publishing isn&apos;t available yet.</p>
          </div>
          <Pill tone="warning">Testing</Pill>
        </div>
        <div className="flex items-center justify-between gap-4 pt-3 border-t border-border">
          <div>
            <p className="text-sm font-medium text-text">Automatic weekly runs</p>
            <p className="text-xs text-muted mt-0.5">Off during testing. Content is generated only when you press Generate now.</p>
          </div>
          <Switch checked={false} disabled onCheckedChange={() => {}} />
        </div>
      </Section>

      <Section title="Weekly frequency" description="How many creatives are generated per week once automatic runs are on. Each pipeline is independent; social images and videos share a limit of 14 per week.">
        <div className="grid sm:grid-cols-2 gap-4">
          {FREQ_FIELDS.map((f) => {
            const v = value(f.key);
            const social = f.key === "socialImageFrequency" || f.key === "socialVideoFrequency";
            return (
              <div key={f.key} className="space-y-1.5">
                <label htmlFor={f.key} className="text-sm font-medium text-text">{f.label}</label>
                <Input id={f.key} type="number" min={0} max={14} value={v} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} error={!valid(v) || (social && socialOverCap)} />
                <p className="text-xs text-muted">{f.hint}</p>
              </div>
            );
          })}
        </div>
        {socialOverCap && <p className="text-xs text-danger">Social images and videos together can&apos;t be more than 14 per week (currently {socialTotal}).</p>}
        {update.error && <p className="text-xs text-danger">{update.error.message}</p>}
        <div className="flex justify-end">
          <Button size="sm" onClick={save} loading={update.isPending} disabled={!dirty || !allValid}>Save</Button>
        </div>
      </Section>

      <p className="text-xs text-muted">
        Timezone for scheduling: {settings.timezone}. Accounts are connected under{" "}
        <Link href={ROUTES.SOCIAL.CONNECTED_ACCOUNTS} className="text-text font-medium hover:underline">Social Media → Connected Accounts</Link>.
      </p>
    </div>
  );
}
