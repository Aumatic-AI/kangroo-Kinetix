"use client";
import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useCreateAdSet } from "../../hooks/useCampaigns";
import { MetaObjective, CreateAdSetInput } from "../../types/meta-ads.types";
import {
  Field,
  Section,
  AudienceFields,
  DeliveryFields,
  BudgetFields,
  DEFAULT_TARGETING,
  DEFAULT_BUDGET,
  TargetingState,
  BudgetState,
  toGeoLocations,
  minLifetimeBudgetCents,
  MIN_DAILY_BUDGET_CENTS,
  useBusinessMetaAdsDefaults,
} from "./shared";

/**
 * "+ Add Ad Set" on an existing campaign — a second (or third...) audience
 * under the same campaign, with its own targeting/schedule and (if the
 * campaign isn't CBO) its own budget. Creates an empty Ad Set only — no ad/
 * creative yet, since Meta allows an Ad Set with zero Ads. Ads get added
 * afterward from that Ad Set's own detail page ("Create Ad").
 */
export function AddAdSetModal({
  campaignId,
  campaignObjective,
  isCbo,
  open,
  onClose,
}: {
  campaignId: string;
  campaignObjective: string | null;
  isCbo: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const objective = (campaignObjective || "OUTCOME_TRAFFIC") as MetaObjective;
  const createAdSet = useCreateAdSet(campaignId);
  const { data: defaults } = useBusinessMetaAdsDefaults();

  const [adSetName, setAdSetName] = useState("");
  const [budget, setBudget] = useState<BudgetState>(DEFAULT_BUDGET);
  const [startAt, setStartAt] = useState<Date | undefined>(undefined);
  const [endAt, setEndAt] = useState<Date | undefined>(undefined);
  const [targeting, setTargeting] = useState<TargetingState>(DEFAULT_TARGETING);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setAdSetName("");
    setBudget(DEFAULT_BUDGET);
    setStartAt(undefined);
    setEndAt(undefined);
    setTargeting(DEFAULT_TARGETING);
    setError("");
  }, [open]);

  useEffect(() => {
    if (!defaults) return;
    setTargeting((prev) => ({ ...prev, advantageAudience: defaults.advantageAudienceDefault }));
  }, [defaults]);

  const patchTargeting = (patch: Partial<TargetingState>) => setTargeting((prev) => ({ ...prev, ...patch }));
  const patchBudget = (patch: Partial<BudgetState>) => setBudget((prev) => ({ ...prev, ...patch }));

  const handleCreate = async () => {
    setError("");
    if (!adSetName.trim()) return setError("Ad set name is required.");
    if (targeting.locations.length === 0) return setError("At least one location is required.");
    if (!isCbo) {
      if (budget.budgetType === "daily") {
        const dollars = parseFloat(budget.dailyDollars);
        if (!dollars || dollars <= 0) return setError("Enter a daily budget greater than $0.");
        if (Math.round(dollars * 100) < MIN_DAILY_BUDGET_CENTS) return setError(`Daily budget too low — minimum is $${(MIN_DAILY_BUDGET_CENTS / 100).toFixed(2)}.`);
      } else {
        if (!endAt) return setError("Lifetime budget requires an End Date.");
        const dollars = parseFloat(budget.lifetimeDollars);
        if (!dollars || dollars <= 0) return setError("Enter a lifetime budget greater than $0.");
        const minCents = minLifetimeBudgetCents(startAt, endAt);
        if (minCents && Math.round(dollars * 100) < minCents) return setError(`Lifetime budget too low — minimum for this date range is $${(minCents / 100).toFixed(2)}.`);
      }
    }

    try {
      const input: CreateAdSetInput = {
        adSetName: adSetName.trim(),
        budgetType: budget.budgetType,
        dailyBudgetCents: !isCbo && budget.budgetType === "daily" ? Math.round(parseFloat(budget.dailyDollars) * 100) : undefined,
        lifetimeBudgetCents: !isCbo && budget.budgetType === "lifetime" ? Math.round(parseFloat(budget.lifetimeDollars) * 100) : undefined,
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
      await createAdSet.mutateAsync(input);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add ad set");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl sm:max-w-2xl bg-background border-border text-text p-0 sm:rounded-xl gap-0 overflow-hidden outline-none flex flex-col h-[85vh] shadow-lg">
        <DialogHeader className="px-6 py-5 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2"><Layers className="w-4 h-4 text-primary" /> Add Ad Set</DialogTitle>
          <p className="text-xs text-muted">A new, empty audience under this campaign — always paused. Add its first ad afterward from the ad set&apos;s own page.</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <Section title="Basics" description="An internal label for this Ad Set — doesn't show to anyone, just helps you tell ad sets apart later.">
            <Field label="Ad Set Name">
              <Input value={adSetName} onChange={(e) => setAdSetName(e.target.value)} placeholder="e.g. Canada — Lookalike" />
            </Field>
          </Section>

          <Section title="Audience" description="Who should see this ad.">
            <AudienceFields state={targeting} setState={patchTargeting} />
          </Section>

          <Section title="Delivery" description="What Meta optimizes for, and where the ad can appear.">
            <DeliveryFields state={targeting} setState={patchTargeting} objective={objective} />
          </Section>

          {!isCbo ? (
            <Section title="Budget & Schedule" description="How much to spend, and when to run.">
              <BudgetFields state={budget} setState={patchBudget} startAt={startAt} endAt={endAt} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start (optional)"><DateTimePicker value={startAt} onChange={setStartAt} placeholder="Now" /></Field>
                <Field label="End (optional, required for Lifetime)"><DateTimePicker value={endAt} onChange={setEndAt} minDate={startAt} placeholder="No end date" /></Field>
              </div>
            </Section>
          ) : (
            <p className="text-xs text-muted">This campaign uses Campaign Budget Optimization — this ad set draws from the shared budget, no separate amount needed.</p>
          )}

          {error && <p className="text-sm text-danger font-medium">{error}</p>}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0 sm:justify-between">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} loading={createAdSet.isPending} icon={<Layers className="w-4 h-4" />}>
            {createAdSet.isPending ? "Adding…" : "Add Ad Set (paused)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
