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

/**
 * Minimal on purpose (spec §18.3): two weekly frequencies, enable/pause, and
 * read-only state for the safeguards. Testing mode and "auto-run off" are
 * enforced by the API and database, not just shown here — Live mode and
 * automatic weekly runs cannot be selected during the testing phase.
 */
export function AutomationPage() {
  const { data: settings, isLoading, error } = useAutomationSettings();
  const update = useUpdateSettings();
  // Edits live in `draft` only until saved; the shown value falls back to the saved setting.
  const [draft, setDraft] = useState<{ social?: string; linkedin?: string; blog?: string }>({});

  if (isLoading) {
    return <div className="max-w-2xl mx-auto space-y-6"><Skeleton className="h-8 w-48 rounded" /><Skeleton className="h-40 w-full rounded-lg" /><Skeleton className="h-40 w-full rounded-lg" /></div>;
  }
  if (error || !settings) {
    return <div className="max-w-2xl mx-auto py-16 text-center border border-default rounded-2xl border-dashed"><p className="text-sm text-danger font-medium">{error?.message ?? "Could not load settings"}</p></div>;
  }

  const social = draft.social ?? String(settings.socialFrequency);
  const linkedin = draft.linkedin ?? String(settings.linkedinFrequency);
  const blog = draft.blog ?? String(settings.blogFrequency);
  const valid = (v: string) => /^\d+$/.test(v) && Number(v) >= 0 && Number(v) <= 14;
  const dirty = social !== String(settings.socialFrequency) || linkedin !== String(settings.linkedinFrequency) || blog !== String(settings.blogFrequency);
  const save = () => update.mutate({ socialFrequency: Number(social), linkedinFrequency: Number(linkedin), blogFrequency: Number(blog) }, { onSuccess: () => setDraft({}) });

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      <div>
        <h2 className="text-2xl font-bold text-text">Automation</h2>
        <p className="text-sm text-muted mt-1">Set how often content is made. The AI chooses the properties, formats and (for social and LinkedIn) posting times.</p>
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

      <Section title="Weekly frequency" description="How many creatives are generated per week once automatic runs are on. Each pipeline is independent.">
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="social-freq" className="text-sm font-medium text-text">Social posts per week</label>
            <Input id="social-freq" type="number" min={0} max={14} value={social} onChange={(e) => setDraft((d) => ({ ...d, social: e.target.value }))} error={!valid(social)} />
            <p className="text-xs text-muted">One image or video, shared on TikTok, Instagram and Facebook.</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="li-freq" className="text-sm font-medium text-text">LinkedIn posts per week</label>
            <Input id="li-freq" type="number" min={0} max={14} value={linkedin} onChange={(e) => setDraft((d) => ({ ...d, linkedin: e.target.value }))} error={!valid(linkedin)} />
            <p className="text-xs text-muted">Professional text + image. Never video.</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="blog-freq" className="text-sm font-medium text-text">Blog posts per week</label>
            <Input id="blog-freq" type="number" min={0} max={14} value={blog} onChange={(e) => setDraft((d) => ({ ...d, blog: e.target.value }))} error={!valid(blog)} />
            <p className="text-xs text-muted">A detailed article about one listing, with images. Display-only — never published.</p>
          </div>
        </div>
        {update.error && <p className="text-xs text-danger">{update.error.message}</p>}
        <div className="flex justify-end">
          <Button size="sm" onClick={save} loading={update.isPending} disabled={!dirty || !valid(social) || !valid(linkedin) || !valid(blog)}>Save</Button>
        </div>
      </Section>

      <p className="text-xs text-muted">
        Timezone for scheduling: {settings.timezone}. Accounts are connected under{" "}
        <Link href={ROUTES.SOCIAL.CONNECTED_ACCOUNTS} className="text-text font-medium hover:underline">Social Media → Connected Accounts</Link>.
      </p>
    </div>
  );
}
