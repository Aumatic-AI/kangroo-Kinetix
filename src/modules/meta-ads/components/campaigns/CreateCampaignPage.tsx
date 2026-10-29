"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Rocket, Video, Image as ImageIcon, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Stepper } from "@/components/ui/stepper";
import { useLaunchCampaign } from "../../hooks/useCampaigns";
import { useMetaAdCreative } from "../../hooks/useAdLibrary";
import { ROUTES } from "@/config/routes";
import { MetaAdCreativePickerItem, MetaObjective, LaunchCampaignInput } from "../../types/meta-ads.types";
import { CampaignPickCreativeDialog } from "./CampaignPickCreativeDialog";
import { MediaPreview } from "@/components/global/MediaPreview";
import {
  Field,
  Section,
  AdCopyFields,
  AudienceFields,
  DeliveryFields,
  BudgetFields,
  DEFAULT_AD_COPY,
  DEFAULT_TARGETING,
  DEFAULT_BUDGET,
  AdCopyState,
  TargetingState,
  BudgetState,
  toGeoLocations,
  minLifetimeBudgetCents,
  MIN_DAILY_BUDGET_CENTS,
  useBusinessMetaAdsDefaults,
} from "./shared";

const OBJECTIVES: { value: MetaObjective; label: string }[] = [
  { value: "OUTCOME_TRAFFIC", label: "Traffic — send people to your website" },
  { value: "OUTCOME_LEADS", label: "Leads — collect enquiries (website or Instant Form)" },
  { value: "OUTCOME_SALES", label: "Sales — drive purchases on your website" },
  { value: "OUTCOME_AWARENESS", label: "Awareness — reach as many people as possible" },
  { value: "OUTCOME_ENGAGEMENT", label: "Engagement — likes, comments, shares" },
];

const BUYING_TYPES = [
  { value: "AUCTION", label: "Auction (recommended)" },
  { value: "RESERVED", label: "Reach & Frequency" },
];

const STEP_LABELS = ["Campaign", "Ad Set", "Creative"];

/**
 * The one and only way to create a brand-new Campaign — always creates a
 * new Campaign + its first Ad Set + first Ad, all paused. Adding another
 * Ad Set to an *existing* campaign, or another creative to an *existing*
 * Ad Set, is a deliberately separate action from the Campaign Details view
 * (AddAdSetModal / AddCreativeModal) — this page only ever has one job.
 * A full page (not a modal) so a long, sectioned form has real room —
 * arrived at via the Campaigns page's "Launch New Campaign" button, or Ad
 * Library's per-creative "Launch" (passing ?creativeId= to preselect it).
 */
export function CreateCampaignPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedId = searchParams.get("creativeId") || "";

  const launchMutation = useLaunchCampaign();
  const { data: preselectedCreative } = useMetaAdCreative(preselectedId);
  const { data: defaults } = useBusinessMetaAdsDefaults();

  const [step, setStep] = useState(1);
  const [campaignName, setCampaignName] = useState("");
  const [objective, setObjective] = useState<MetaObjective>("OUTCOME_TRAFFIC");
  const [buyingType, setBuyingType] = useState<"AUCTION" | "RESERVED">("AUCTION");
  const [cbo, setCbo] = useState(false);
  const [budget, setBudget] = useState<BudgetState>(DEFAULT_BUDGET);
  const [startAt, setStartAt] = useState<Date | undefined>(undefined);
  const [endAt, setEndAt] = useState<Date | undefined>(undefined);
  const [adSetName, setAdSetName] = useState("");
  const [targeting, setTargeting] = useState<TargetingState>(DEFAULT_TARGETING);
  const [creative, setCreative] = useState<MetaAdCreativePickerItem | null>(null);
  const [pickingCreative, setPickingCreative] = useState(false);
  const [previewingCreative, setPreviewingCreative] = useState(false);
  const [adCopy, setAdCopy] = useState<AdCopyState>(DEFAULT_AD_COPY);
  const [error, setError] = useState("");

  useEffect(() => {
    if (preselectedCreative) setCreative(preselectedCreative);
  }, [preselectedCreative]);

  useEffect(() => {
    if (!defaults) return;
    setAdCopy((prev) => (prev.websiteUrl ? prev : { ...prev, websiteUrl: defaults.websiteUrl }));
    setTargeting((prev) => ({ ...prev, advantageAudience: defaults.advantageAudienceDefault }));
  }, [defaults]);

  useEffect(() => {
    if (!creative) return;
    setAdCopy((prev) => ({
      ...prev,
      adName: prev.adName || creative.idea_prompt?.slice(0, 60) || `${creative.service || "Kinetix"} ad`,
      headline: creative.ad_script?.headline || prev.headline,
      primaryText: creative.ad_script?.primary_text || prev.primaryText,
    }));
  }, [creative]);

  useEffect(() => {
    if (campaignName && !adSetName) setAdSetName(`${campaignName} - Ad Set`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignName]);

  const isVideo = creative?.type === "video";
  const isLeadsObjective = objective === "OUTCOME_LEADS";
  const patchTargeting = (patch: Partial<TargetingState>) => setTargeting((prev) => ({ ...prev, ...patch }));
  const patchAdCopy = (patch: Partial<AdCopyState>) => setAdCopy((prev) => ({ ...prev, ...patch }));
  const patchBudget = (patch: Partial<BudgetState>) => setBudget((prev) => ({ ...prev, ...patch }));

  function validateBudget(): string {
    if (budget.budgetType === "daily") {
      const dollars = parseFloat(budget.dailyDollars);
      if (!dollars || dollars <= 0) return "Enter a daily budget greater than $0.";
      if (Math.round(dollars * 100) < MIN_DAILY_BUDGET_CENTS) return `Daily budget too low — minimum is $${(MIN_DAILY_BUDGET_CENTS / 100).toFixed(2)}.`;
      return "";
    }
    if (!endAt) return "Lifetime budget requires an End Date.";
    const dollars = parseFloat(budget.lifetimeDollars);
    if (!dollars || dollars <= 0) return "Enter a lifetime budget greater than $0.";
    const minCents = minLifetimeBudgetCents(startAt, endAt);
    if (minCents && Math.round(dollars * 100) < minCents) {
      return `Lifetime budget too low — minimum for this date range is $${(minCents / 100).toFixed(2)}.`;
    }
    return "";
  }

  function validateStep(n: number): string {
    if (n === 1) {
      if (!campaignName.trim()) return "Campaign name is required.";
      if (cbo) return validateBudget();
    }
    if (n === 2) {
      if (!adSetName.trim()) return "Ad set name is required.";
      if (targeting.locations.length === 0) return "At least one location is required.";
      if (!cbo) return validateBudget();
    }
    if (n === 3) {
      if (!creative) return "Pick a creative to launch.";
      if (!adCopy.adName.trim()) return "Ad name is required.";
      if (!adCopy.headline.trim() || !adCopy.primaryText.trim()) return "Headline and primary text are required.";
      if (!(isLeadsObjective && adCopy.leadGenFormId) && !adCopy.websiteUrl.trim()) return "Destination URL is required.";
    }
    return "";
  }

  const goNext = () => {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError("");
    setStep((s) => Math.min(3, s + 1));
  };
  const goBack = () => { setError(""); setStep((s) => Math.max(1, s - 1)); };
  const goToStep = (n: number) => { if (n < step) { setError(""); setStep(n); } };

  const handleLaunch = async () => {
    const err = validateStep(3);
    if (err) { setError(err); return; }
    setError("");
    try {
      const input: LaunchCampaignInput = {
        creativeId: creative!.id,
        campaignName: campaignName.trim(),
        objective,
        buyingType,
        cbo,
        adSetName: adSetName.trim(),
        budgetType: budget.budgetType,
        dailyBudgetCents: budget.budgetType === "daily" ? Math.round(parseFloat(budget.dailyDollars) * 100) : undefined,
        lifetimeBudgetCents: budget.budgetType === "lifetime" ? Math.round(parseFloat(budget.lifetimeDollars) * 100) : undefined,
        adName: adCopy.adName.trim(),
        headline: adCopy.headline.trim(),
        primaryText: adCopy.primaryText.trim(),
        description: adCopy.description.trim() || undefined,
        ctaType: adCopy.ctaType,
        websiteUrl: adCopy.websiteUrl.trim(),
        leadGenFormId: adCopy.leadGenFormId || undefined,
        geoLocations: toGeoLocations(targeting.locations),
        ageMin: targeting.ageMin,
        ageMax: targeting.ageMax,
        gender: targeting.gender,
        advantageAudience: targeting.advantageAudience,
        optimizationGoal: targeting.optimizationGoal || undefined,
        placementsMode: targeting.placementsMode,
        publisherPlatforms: targeting.placementsMode === "manual" ? targeting.publisherPlatforms : undefined,
        facebookPositions: targeting.placementsMode === "manual" ? targeting.facebookPositions : undefined,
        instagramPositions: targeting.placementsMode === "manual" ? targeting.instagramPositions : undefined,
        startAt: startAt?.toISOString(),
        endAt: endAt?.toISOString(),
      };
      await launchMutation.mutateAsync(input);
      router.push(ROUTES.META_ADS.CAMPAIGNS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to launch campaign");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      <div>
        <button
          type="button"
          onClick={() => router.push(ROUTES.META_ADS.CAMPAIGNS)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text transition-colors mb-3"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Campaigns
        </button>
        <h2 className="text-2xl font-bold text-text flex items-center gap-2"><Rocket className="w-5 h-5 text-primary" /> Launch New Campaign</h2>
        <p className="text-sm text-muted mt-1">Creates a real Campaign, Ad Set, and Ad on Meta — always paused. Nothing spends until you Resume or Smart Run it.</p>
      </div>

      <Stepper steps={3} current={step} labels={STEP_LABELS} onStepClick={goToStep} />

      <div className="space-y-4">
        {step === 1 && (
          <>
            <Section title="Basics" description="Name your campaign and choose what you want Meta to optimize for.">
              <Field label="Campaign Name">
                <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="e.g. Kangrooo Toronto — Traffic" />
              </Field>
              <Field label="Objective" hint="What Meta optimizes delivery for.">
                <Dropdown value={objective} onValueChange={(v) => setObjective(v as MetaObjective)} options={OBJECTIVES} />
              </Field>
            </Section>

            <Section title="Buying & Budget" description="How Meta buys impressions, and whether one budget covers every ad set you add later.">
              <Field label="Buying Type" hint="Auction is what almost every account uses. Reach & Frequency is a fixed-price, reserved buy that needs a Meta ad rep — most self-serve accounts can't use it.">
                <Dropdown value={buyingType} onValueChange={(v) => setBuyingType(v as "AUCTION" | "RESERVED")} options={BUYING_TYPES} />
              </Field>
              <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-border p-3">
                <input type="checkbox" checked={cbo} onChange={(e) => setCbo(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-border accent-primary" />
                <span className="text-xs text-text">
                  <span className="font-semibold">Campaign Budget Optimization (CBO)</span>
                  <span className="block text-muted">Share one budget across every Ad Set in this campaign — Meta shifts spend toward whichever performs best. Leave off to set this Ad Set&apos;s own budget in the next step.</span>
                </span>
              </label>
              {cbo && (
                <>
                  <BudgetFields state={budget} setState={patchBudget} startAt={startAt} endAt={endAt} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Start (optional)"><DateTimePicker value={startAt} onChange={setStartAt} placeholder="Now" /></Field>
                    <Field label="End (optional, required for Lifetime)"><DateTimePicker value={endAt} onChange={setEndAt} minDate={startAt} placeholder="No end date" /></Field>
                  </div>
                </>
              )}
            </Section>
          </>
        )}

        {step === 2 && (
          <>
            <Section title="Basics" description="An internal label for this Ad Set — doesn't show to anyone, just helps you tell ad sets apart later.">
              <Field label="Ad Set Name">
                <Input value={adSetName} onChange={(e) => setAdSetName(e.target.value)} placeholder="e.g. Kangrooo Toronto — Traffic - Ad Set" />
              </Field>
            </Section>

            <Section title="Audience" description="Who should see this ad.">
              <AudienceFields state={targeting} setState={patchTargeting} />
            </Section>

            <Section title="Delivery" description="What Meta optimizes for, and where the ad can appear.">
              <DeliveryFields state={targeting} setState={patchTargeting} objective={objective} />
            </Section>

            {!cbo && (
              <Section title="Budget & Schedule" description="How much to spend, and when to run.">
                <BudgetFields state={budget} setState={patchBudget} startAt={startAt} endAt={endAt} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start (optional)"><DateTimePicker value={startAt} onChange={setStartAt} placeholder="Now" /></Field>
                  <Field label="End (optional, required for Lifetime)"><DateTimePicker value={endAt} onChange={setEndAt} minDate={startAt} placeholder="No end date" /></Field>
                </div>
              </Section>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <Section title="Creative" description="Which approved ad this campaign will run.">
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="relative w-16 h-16 rounded-md bg-surface overflow-hidden shrink-0 flex items-center justify-center">
                  {creative?.media_urls?.[0] ? (
                    isVideo ? (
                      <video src={creative.media_urls[0]} className="w-full h-full object-cover" muted preload="metadata" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={creative.media_urls[0]} alt="" className="w-full h-full object-cover" />
                    )
                  ) : creative?.type === "video" ? (
                    <Video className="w-5 h-5 text-muted" />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-muted" />
                  )}
                  {creative?.media_urls?.[0] && (
                    <button
                      type="button"
                      onClick={() => setPreviewingCreative(true)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
                      title="Preview"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                    </button>
                  )}
                </div>
                <p className="flex-1 min-w-0 text-sm font-semibold text-text truncate">
                  {creative ? creative.ad_script?.headline || "Untitled creative" : "No creative selected"}
                </p>
                <Button size="sm" variant="outline" onClick={() => setPickingCreative(true)}>{creative ? "Change" : "Choose creative"}</Button>
              </div>
            </Section>

            <Section title="Ad Copy" description="What people see, and where they go after clicking.">
              <AdCopyFields state={adCopy} setState={patchAdCopy} showLeadForm={isLeadsObjective} />
            </Section>
          </>
        )}

        {error && <p className="text-sm text-danger font-medium">{error}</p>}
      </div>

      <div className="flex items-center justify-between pt-2">
        {step > 1 ? (
          <Button variant="outline" onClick={goBack} icon={<ChevronLeft className="w-4 h-4" />}>Back</Button>
        ) : (
          <Button variant="outline" onClick={() => router.push(ROUTES.META_ADS.CAMPAIGNS)}>Cancel</Button>
        )}
        {step < 3 ? (
          <Button onClick={goNext} icon={<ChevronRight className="w-4 h-4" />}>Next</Button>
        ) : (
          <Button onClick={handleLaunch} loading={launchMutation.isPending} icon={<Rocket className="w-4 h-4" />}>
            {launchMutation.isPending ? "Launching…" : "Launch (paused)"}
          </Button>
        )}
      </div>

      <CampaignPickCreativeDialog open={pickingCreative} onClose={() => setPickingCreative(false)} onPick={(c) => { setCreative(c); setPickingCreative(false); }} />
      <MediaPreview open={previewingCreative} onClose={() => setPreviewingCreative(false)} mediaUrl={creative?.media_urls?.[0] || null} type={isVideo ? "video" : "image"} />
    </div>
  );
}
