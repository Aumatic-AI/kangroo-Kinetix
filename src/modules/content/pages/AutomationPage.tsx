"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
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
  { key: "blogFrequency", label: "Blog posts per week", hint: "A detailed article about one listing, with images. Published to the WordPress blog in Live mode." },
];

type Change = { mode: "testing" | "live" } | { autoRunEnabled: boolean };

/** What each switch does, said before it happens (ConfirmModal). */
function describe(change: Change): { title: string; description: string; confirmLabel: string; variant: "primary" | "destructive" } {
  if ("mode" in change) {
    return change.mode === "live"
      ? { title: "Switch to Live?", confirmLabel: "Go Live", variant: "destructive",
          description: "From now on, content made by automation is PUBLISHED to the connected accounts: social and LinkedIn posts at their AI-chosen times, blogs to WordPress, each at its AI-chosen time in the week. Content already made in Testing is never published. Check Connected Accounts first: a platform with no connected account gets no posts." }
      : { title: "Switch back to Testing?", confirmLabel: "Switch to Testing", variant: "primary",
          description: "Nothing more is published. Posts and blogs that haven't gone out yet are put on hold, and released (if still valid) when you switch back to Live." };
  }
  return change.autoRunEnabled
    ? { title: "Turn on automatic weekly runs?", confirmLabel: "Turn on", variant: "primary",
        description: "Every Friday at 18:00 (Toronto) the next week's content is planned and generated from the weekly frequencies below, which costs AI credits. In Live mode it is then published through the week." }
    : { title: "Turn off automatic weekly runs?", confirmLabel: "Turn off", variant: "primary",
        description: "No new weekly content is generated. Anything already scheduled still publishes at its time." };
}

/**
 * Minimal on purpose (spec §18.3): weekly frequencies (social images and social
 * videos are set separately — the user picks the format), enable/pause, mode and
 * automatic weekly runs. Mode, pause and auto-run are owner/admin only (API +
 * database). Live is what publishes; see docs/architecture/content_automation.md.
 */
export function AutomationPage() {
  const { data: settings, isLoading, error } = useAutomationSettings();
  const update = useUpdateSettings();
  // Edits live in `draft` only until saved; the shown value falls back to the saved setting.
  const [draft, setDraft] = useState<Partial<Record<FreqKey, string>>>({});
  const [pending, setPending] = useState<Change | null>(null);
  const confirmChange = async () => {
    if (!pending) return;
    try {
      await update.mutateAsync(pending);
      setPending(null);
    } catch {
      /* shown inline in the dialog */
    }
  };

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
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-text">Live mode</p>
              <Pill tone={settings.mode === "live" ? "success" : "warning"}>{settings.mode === "live" ? "Live" : "Testing"}</Pill>
            </div>
            <p className="text-xs text-muted mt-0.5">
              {settings.mode === "live"
                ? "Automation content is published: social and LinkedIn posts and WordPress blogs, each at its AI-chosen time."
                : "Testing keeps everything private in the gallery. Turn on to publish automation content."}
            </p>
          </div>
          <Switch checked={settings.mode === "live"} disabled={!settings.canAdmin || update.isPending} onCheckedChange={(on) => setPending({ mode: on ? "live" : "testing" })} />
        </div>
        <div className="flex items-center justify-between gap-4 pt-3 border-t border-border">
          <div>
            <p className="text-sm font-medium text-text">Automatic weekly runs</p>
            <p className="text-xs text-muted mt-0.5">
              {settings.autoRunEnabled
                ? "Every Friday at 18:00 (Toronto) the next week's content is planned and generated."
                : "Off. Content is generated only when you press Generate now in the Content Gallery."}
            </p>
          </div>
          <Switch checked={settings.autoRunEnabled} disabled={!settings.canAdmin || update.isPending} onCheckedChange={(on) => setPending({ autoRunEnabled: on })} />
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

      {pending && (
        <ConfirmModal
          open
          onOpenChange={(o) => { if (!update.isPending && !o) setPending(null); }}
          {...describe(pending)}
          loading={update.isPending}
          error={update.error?.message}
          onConfirm={confirmChange}
        />
      )}

      <p className="text-xs text-muted">
        Timezone for scheduling: {settings.timezone}. Accounts are connected under{" "}
        <Link href={ROUTES.SOCIAL.CONNECTED_ACCOUNTS} className="text-text font-medium hover:underline">Social Media → Connected Accounts</Link>.
      </p>
    </div>
  );
}
