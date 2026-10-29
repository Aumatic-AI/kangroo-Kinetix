"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Switch } from "@/components/ui/Switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ROUTES } from "@/config/routes";
import { formatDate, formatDateTime } from "@/utils/datetime";
import { useAdSetDetail, useUpdateAdSetDetails } from "../../hooks/useCampaigns";
import { AdSetPageDetail } from "../../types/meta-ads.types";
import { StatusChip, LevelChip, InfoItem, MetricsRow, Section, DetailBreadcrumbSkeleton, DetailHeaderSkeleton, InfoGridSkeleton, MetricsRowSkeleton, DetailChildRowsSkeleton } from "./shared";
import { StatusActions } from "./StatusActions";
import { AddCreativeModal } from "./AddCreativeModal";

const GENDER_OPTIONS = [{ value: "0", label: "All" }, { value: "1", label: "Male" }, { value: "2", label: "Female" }];

function genderLabel(genders: number[]): string {
  if (genders.length === 0) return "All";
  const hasMale = genders.includes(1);
  const hasFemale = genders.includes(2);
  if (hasMale && hasFemale) return "All";
  return hasMale ? "Male" : "Female";
}

function locationsSummary(t: AdSetPageDetail["targetingSummary"]): string {
  const parts: string[] = [];
  if (t.countries.length) parts.push(t.countries.join(", "));
  if (t.regions.length) parts.push(`${t.regions.length} region${t.regions.length === 1 ? "" : "s"}`);
  if (t.cities.length) parts.push(`${t.cities.length} cit${t.cities.length === 1 ? "y" : "ies"}`);
  return parts.length ? parts.join(" + ") : "—";
}

function placementsSummary(p: AdSetPageDetail["placementsSummary"]): string {
  if (p.mode !== "manual") return "Advantage+ (automatic)";
  return p.publisherPlatforms.length ? p.publisherPlatforms.map((v) => (v === "facebook" ? "Facebook" : v === "instagram" ? "Instagram" : v)).join(", ") : "Manual";
}

/**
 * Ad Set Detail — reached from the Campaign Detail page's Ad Sets list.
 * Shows every targeting/delivery/budget field for this Ad Set plus its
 * lifetime performance, then the list of its Ads (basic fields only — a
 * given Ad's full copy/creative is a separate page, one level down).
 * "Create Ad" is the only way to add an Ad here — Ad Sets themselves are
 * always created empty (see the Campaign Detail page's "Add Ad Set").
 */
interface AdSetDraft {
  name: string;
  endAt?: Date;
  budgetDollars: string;
  ageMin: string;
  ageMax: string;
  gender: 0 | 1 | 2;
  advantageAudience: boolean;
}

export function AdSetDetailPage() {
  const { campaignId, adSetId } = useParams<{ campaignId: string; adSetId: string }>();
  const router = useRouter();
  const { data: adSet, isLoading } = useAdSetDetail(adSetId);
  const [creatingAd, setCreatingAd] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<AdSetDraft>({ name: "", budgetDollars: "", ageMin: "18", ageMax: "65", gender: 0, advantageAudience: false });
  const [confirmingSave, setConfirmingSave] = useState(false);
  const [error, setError] = useState("");
  const updateAdSet = useUpdateAdSetDetails();

  if (isLoading || !adSet) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 pb-10">
        <DetailBreadcrumbSkeleton levels={3} />
        <DetailHeaderSkeleton />

        <Section title="Ad Set Info" description="Targeting, delivery, and budget for this ad set.">
          <InfoGridSkeleton count={11} />
        </Section>

        <Section title="Performance" description="Lifetime totals, live from Meta — never a cached snapshot.">
          <MetricsRowSkeleton />
        </Section>

        <div className="flex items-center justify-between pt-2">
          <h3 className="text-lg font-semibold text-text">Ads</h3>
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
        <DetailChildRowsSkeleton count={2} variant="thumbnail" />
      </div>
    );
  }

  const isLeadGenAdSet = adSet.optimizationGoal === "LEAD_GENERATION";
  const hasOwnBudget = adSet.dailyBudgetCents != null || adSet.lifetimeBudgetCents != null;

  const startEditing = () => {
    setError("");
    setDraft({
      name: adSet.name,
      endAt: adSet.endAt ? new Date(adSet.endAt) : undefined,
      budgetDollars: hasOwnBudget ? String((adSet.dailyBudgetCents ?? adSet.lifetimeBudgetCents ?? 0) / 100) : "",
      ageMin: String(adSet.targetingSummary.ageMin ?? 18),
      ageMax: String(adSet.targetingSummary.ageMax ?? 65),
      gender: adSet.targetingSummary.genders.includes(1) ? 1 : adSet.targetingSummary.genders.includes(2) ? 2 : 0,
      advantageAudience: adSet.targetingSummary.advantageAudience,
    });
    setIsEditing(true);
  };

  const discardEditing = () => {
    setIsEditing(false);
    setError("");
  };

  const handleSave = async () => {
    setError("");
    try {
      const budgetCents = hasOwnBudget ? Math.round(Number(draft.budgetDollars) * 100) : undefined;
      await updateAdSet.mutateAsync({
        adSetId: adSet.id,
        campaignId,
        ...(draft.name.trim() && draft.name !== adSet.name ? { name: draft.name.trim() } : {}),
        ...(draft.endAt && draft.endAt.toISOString() !== adSet.endAt ? { endAt: draft.endAt.toISOString() } : {}),
        ...(budgetCents != null && adSet.dailyBudgetCents != null ? { dailyBudgetCents: budgetCents } : {}),
        ...(budgetCents != null && adSet.lifetimeBudgetCents != null ? { lifetimeBudgetCents: budgetCents } : {}),
        ...(Number(draft.ageMin) !== adSet.targetingSummary.ageMin ? { ageMin: Number(draft.ageMin) } : {}),
        ...(Number(draft.ageMax) !== adSet.targetingSummary.ageMax ? { ageMax: Number(draft.ageMax) } : {}),
        ...(draft.gender !== (adSet.targetingSummary.genders.includes(1) ? 1 : adSet.targetingSummary.genders.includes(2) ? 2 : 0) ? { gender: draft.gender } : {}),
        ...(draft.advantageAudience !== adSet.targetingSummary.advantageAudience ? { advantageAudience: draft.advantageAudience } : {}),
      });
      setIsEditing(false);
      setConfirmingSave(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save changes");
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={ROUTES.META_ADS.CAMPAIGNS} />}>Campaigns</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={ROUTES.META_ADS.CAMPAIGN_DETAIL(campaignId)} />}>{adSet.campaignName}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{adSet.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <LevelChip level="adset" />
            {isEditing ? (
              <div className="w-full max-w-sm">
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className="h-9 text-base font-bold"
                />
              </div>
            ) : (
              <h2 className="text-2xl font-bold text-text truncate">{adSet.name}</h2>
            )}
          </div>
        </div>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={discardEditing}>Discard</Button>
            <Button size="sm" onClick={() => setConfirmingSave(true)} disabled={!draft.name.trim()}>Save</Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <StatusActions level="adset" id={adSet.id} campaignId={campaignId} status={adSet.status} />
            <Button variant="outline" size="sm" onClick={startEditing} icon={<Pencil className="w-3.5 h-3.5" />}>Edit</Button>
          </div>
        )}
      </div>

      <Section
        title={
          <>
            Ad Set Info
            <StatusChip status={adSet.status} />
          </>
        }
        description="Targeting, delivery, and budget for this ad set."
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <InfoItem label="Optimization Goal" value={adSet.optimizationGoal?.replace(/_/g, " ") || "—"} />
          <InfoItem label="Bid Strategy" value={adSet.bidStrategy?.replace(/_/g, " ") || "—"} />
          {isEditing && hasOwnBudget ? (
            <div className="min-w-0 space-y-1.5">
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">Budget ({adSet.dailyBudgetCents != null ? "daily" : "lifetime"})</p>
              <Input type="number" min="1" step="1" value={draft.budgetDollars} onChange={(e) => setDraft((d) => ({ ...d, budgetDollars: e.target.value }))} className="h-9 text-sm" />
            </div>
          ) : (
            <InfoItem
              label="Budget"
              value={adSet.dailyBudgetCents != null ? `$${(adSet.dailyBudgetCents / 100).toFixed(2)}/day` : adSet.lifetimeBudgetCents != null ? `$${(adSet.lifetimeBudgetCents / 100).toFixed(2)} total` : "Shared campaign budget"}
            />
          )}
          <InfoItem label="Locations" value={locationsSummary(adSet.targetingSummary)} />
          {isEditing ? (
            <div className="min-w-0 grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">Min Age</p>
                <Input type="number" min="18" max="65" value={draft.ageMin} onChange={(e) => setDraft((d) => ({ ...d, ageMin: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">Max Age</p>
                <Input type="number" min="18" max="65" value={draft.ageMax} onChange={(e) => setDraft((d) => ({ ...d, ageMax: e.target.value }))} className="h-9 text-sm" />
              </div>
            </div>
          ) : (
            <InfoItem label="Age Range" value={`${adSet.targetingSummary.ageMin ?? 18}–${adSet.targetingSummary.ageMax ?? 65}`} />
          )}
          {isEditing ? (
            <div className="min-w-0 space-y-1.5">
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">Gender</p>
              <Dropdown value={String(draft.gender)} onValueChange={(v) => setDraft((d) => ({ ...d, gender: Number(v) as 0 | 1 | 2 }))} options={GENDER_OPTIONS} />
            </div>
          ) : (
            <InfoItem label="Gender" value={genderLabel(adSet.targetingSummary.genders)} />
          )}
          {isEditing ? (
            <div className="min-w-0 space-y-1.5">
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">Advantage+ Audience</p>
              <div className="flex items-center gap-2 h-9">
                <Switch checked={draft.advantageAudience} onCheckedChange={(checked) => setDraft((d) => ({ ...d, advantageAudience: checked }))} />
                <span className="text-sm text-text">{draft.advantageAudience ? "On" : "Off"}</span>
              </div>
            </div>
          ) : (
            <InfoItem label="Advantage+ Audience" value={adSet.targetingSummary.advantageAudience ? "On" : "Off"} />
          )}
          <InfoItem label="Placements" value={placementsSummary(adSet.placementsSummary)} />
          <InfoItem label="Start" value={adSet.startAt ? formatDateTime(adSet.startAt) : "—"} />
          {isEditing ? (
            <div className="min-w-0 space-y-1.5">
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">End</p>
              <DateTimePicker value={draft.endAt} onChange={(d) => setDraft((prev) => ({ ...prev, endAt: d }))} className="w-full h-9 text-sm" />
            </div>
          ) : (
            <InfoItem label="End" value={adSet.endAt ? formatDateTime(adSet.endAt) : "No end date"} />
          )}
          <InfoItem label="Created" value={formatDate(adSet.createdAt)} />
          <InfoItem label="Ads" value={String(adSet.ads.length)} />
        </div>
      </Section>

      <Section title="Performance" description="Lifetime totals, live from Meta — never a cached snapshot.">
        <MetricsRow metrics={adSet.metrics} showLeads={isLeadGenAdSet} />
      </Section>

      <div className="flex items-center justify-between pt-2">
        <h3 className="text-lg font-semibold text-text">Ads</h3>
        <Button size="sm" variant="outline" onClick={() => setCreatingAd(true)} icon={<Plus className="w-3.5 h-3.5" />}>
          Create Ad
        </Button>
      </div>

      {adSet.ads.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed border-default rounded-lg text-sm text-muted">
          No ads yet — create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {adSet.ads.map((ad) => (
            <button
              key={ad.id}
              onClick={() => router.push(ROUTES.META_ADS.AD_DETAIL(campaignId, adSetId, ad.id))}
              className="w-full text-left flex items-center gap-3 bg-background border border-border rounded-lg px-4 py-3 hover:border-primary/40 hover:shadow-sm transition-all"
            >
              {ad.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ad.thumbnailUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-border shrink-0" />
              )}
              <p className="flex-1 min-w-0 text-sm font-bold text-text truncate">{ad.name}</p>
              <StatusChip status={ad.status} />
            </button>
          ))}
        </div>
      )}

      <AddCreativeModal
        adSetId={adSetId}
        campaignId={campaignId}
        isLeadGenAdSet={isLeadGenAdSet}
        open={creatingAd}
        onClose={() => setCreatingAd(false)}
      />

      <ConfirmModal
        open={confirmingSave}
        onOpenChange={(open) => { if (!open && !updateAdSet.isPending) { setConfirmingSave(false); setError(""); } }}
        title="Save changes?"
        description="This updates the ad set directly on Meta."
        confirmLabel="Save"
        variant="primary"
        loading={updateAdSet.isPending}
        error={error}
        onConfirm={handleSave}
      />
    </div>
  );
}
