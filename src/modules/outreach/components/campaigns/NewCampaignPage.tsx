"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import { Dropdown } from "@/components/ui/Dropdown";
import { useCreateOutreachCampaign } from "../../hooks/useCampaigns";
import { useMetaCampaignBreakdown } from "@/modules/outreach/hooks/useLeads";
import { FormSection } from "./FormSection";
import { useBusinessStore } from "@/store/business.store";
import { ROUTES } from "@/config/routes";

const TARGET_REGIONS = ["Europe", "Middle East", "Asia", "North America", "Global"].map((v) => ({ value: v, label: v }));
const TONE_OPTIONS = ["Friendly and professional", "Direct and concise", "Warm and consultative"].map((v) => ({ value: v, label: v }));

export function NewCampaignPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [selectedMetaCampaigns, setSelectedMetaCampaigns] = useState<string[]>([]);
  const [serviceType, setServiceType] = useState("");
  const [targetRegion, setTargetRegion] = useState("");
  const [goal, setGoal] = useState("");
  const [tone, setTone] = useState("Friendly and professional");
  const [messageBrief, setMessageBrief] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaLink, setCtaLink] = useState("");
  const [error, setError] = useState("");

  const { data: metaCampaigns = [] } = useMetaCampaignBreakdown();
  const createCampaign = useCreateOutreachCampaign();
  const business = useBusinessStore((s) => s.business);
  const serviceOptions = [...(business?.services ?? []).map((s) => s.name), "All Services"];

  const hasAnyList = selectedMetaCampaigns.length > 0;
  const combinedEligible = metaCampaigns
    .filter((c) => selectedMetaCampaigns.includes(c.campaignName))
    .reduce((sum, c) => sum + c.emailableLeads, 0);

  const toggleMetaCampaign = (campaignName: string) =>
    setSelectedMetaCampaigns((prev) => (prev.includes(campaignName) ? prev.filter((x) => x !== campaignName) : [...prev, campaignName]));

  const handleGenerate = async () => {
    setError("");
    if (!name.trim() || !hasAnyList || !serviceType || !targetRegion || !goal.trim() || !messageBrief.trim()) {
      return setError("Fill in a name, at least one campaign, service type, target region, goal, and message.");
    }
    try {
      const result = await createCampaign.mutateAsync({
        name: name.trim(),
        listIds: [],
        metaCampaignNames: selectedMetaCampaigns,
        serviceType,
        targetRegion,
        goal: goal.trim(),
        tone,
        messageBrief: messageBrief.trim(),
        ctaText: ctaText.trim() || undefined,
        ctaLink: ctaLink.trim() || undefined,
      });
      router.replace(ROUTES.OUTREACH.CAMPAIGN_DETAIL(result.campaign.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate the draft");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      <Link href={ROUTES.OUTREACH.CAMPAIGNS} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
        <ArrowLeft className="w-4 h-4" /> Back to Campaigns
      </Link>

      <div>
        <h2 className="text-2xl font-bold text-text">New Campaign</h2>
        <p className="text-sm text-muted mt-1">Fill this in and we&apos;ll write the first draft — you&apos;ll review it before anything sends.</p>
      </div>

      <FormSection title="Campaign Details">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-muted uppercase tracking-wide">Campaign name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q3 Toronto Event Planners" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-muted uppercase tracking-wide">Meta Ads Campaigns</label>
          {metaCampaigns.length === 0 ? (
            <p className="text-xs text-muted pt-2">No leads captured in Meta Ads yet.</p>
          ) : (
            <div className="border border-default rounded-lg divide-y divide-border max-h-56 overflow-y-auto">
              {metaCampaigns.map((c) => (
                <label key={c.campaignName} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-surface">
                  <span className="flex items-center gap-2.5">
                    <input type="checkbox" className="accent-primary" checked={selectedMetaCampaigns.includes(c.campaignName)} onChange={() => toggleMetaCampaign(c.campaignName)} />
                    <span className="font-medium text-text">{c.campaignName}</span>
                  </span>
                  <span className="text-xs text-muted shrink-0">{c.totalLeads} lead{c.totalLeads === 1 ? "" : "s"} · {c.emailableLeads} with email</span>
                </label>
              ))}
            </div>
          )}
          {hasAnyList && (
            <p className="text-xs text-muted">{combinedEligible} lead{combinedEligible === 1 ? "" : "s"} will be eligible — only ones with an email on file are emailed.</p>
          )}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted uppercase tracking-wide">Service type</label>
            <Dropdown value={serviceType} onValueChange={setServiceType} placeholder="Choose a service" options={serviceOptions.map((s) => ({ value: s, label: s }))} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted uppercase tracking-wide">Target region</label>
            <Dropdown value={targetRegion} onValueChange={setTargetRegion} placeholder="Choose a region" options={TARGET_REGIONS} />
          </div>
        </div>
      </FormSection>

      <FormSection title="Your Message">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted uppercase tracking-wide">Goal</label>
            <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Book a free consultation call" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted uppercase tracking-wide">Tone</label>
            <Dropdown value={tone} onValueChange={setTone} options={TONE_OPTIONS} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-muted uppercase tracking-wide">What should the email say?</label>
          <Textarea value={messageBrief} onChange={(e) => setMessageBrief(e.target.value)} rows={3} placeholder="Describe the message — what you're offering and why they'd care" />
        </div>
      </FormSection>

      <FormSection title="Call to Action">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted uppercase tracking-wide">Button text</label>
            <Input value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="e.g. Book Free Consultation" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted uppercase tracking-wide">Button link (optional)</label>
            <Input value={ctaLink} onChange={(e) => setCtaLink(e.target.value)} placeholder="https://…" />
          </div>
        </div>
      </FormSection>

      {error && <p className="text-sm text-danger font-medium">{error}</p>}

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => router.push(ROUTES.OUTREACH.CAMPAIGNS)}>Cancel</Button>
        <Button onClick={handleGenerate} loading={createCampaign.isPending} icon={<Sparkles className="w-4 h-4" />}>
          {createCampaign.isPending ? "Writing…" : "Generate Draft"}
        </Button>
      </div>
    </div>
  );
}
