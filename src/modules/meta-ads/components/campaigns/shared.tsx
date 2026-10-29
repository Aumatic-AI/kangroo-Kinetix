"use client";
import { Fragment, ReactNode, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Globe, MapPin, Building2, DollarSign, Eye, MousePointerClick, Percent, BarChart3, Users, UserPlus } from "lucide-react";
import { SiFacebook, SiInstagram } from "react-icons/si";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import { Dropdown } from "@/components/ui/Dropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { createClient } from "@/lib/supabase/client";
import { useLeadForms } from "../../hooks/useLeads";
import { MetaObjective, OBJECTIVE_GOALS, GeoLocationEntry, BudgetType, MetaMetrics } from "../../types/meta-ads.types";

export const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "text-success bg-success-bg border-success-border",
  PAUSED: "text-warning bg-warning-bg border-warning-border",
  CAMPAIGN_PAUSED: "text-warning bg-warning-bg border-warning-border",
  ADSET_PAUSED: "text-warning bg-warning-bg border-warning-border",
  ARCHIVED: "text-danger bg-danger-bg border-danger-border",
  NOT_ON_META: "text-muted bg-surface border-default",
};

/** The one status-pill look used everywhere a Campaign/Ad Set/Ad's status
 * is shown — the Campaigns grid, and all three detail pages. */
export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border whitespace-nowrap ${STATUS_STYLE[status] || "text-muted bg-surface border-default"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

const LEVEL_LABEL: Record<"campaign" | "adset" | "ad", string> = { campaign: "Campaign", adset: "Ad Set", ad: "Ad" };

/** A neutral "what kind of object is this page about" chip — distinct from
 * StatusChip (which is always semantically colored). Since all three detail
 * pages share the same layout, this is the quick visual cue for which one
 * you're on, alongside the breadcrumb. */
export function LevelChip({ level }: { level: "campaign" | "adset" | "ad" }) {
  return (
    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border bg-secondary text-muted border-border">
      {LEVEL_LABEL[level]}
    </span>
  );
}

/** A read-only label/value pair for a detail page's info grid — e.g.
 * Objective, Buying Type, Schedule. Matches the same small-caps-label +
 * medium-value convention already used for info panels elsewhere in the
 * app (e.g. the outreach Campaign Detail page's Field component). */
export function InfoItem({ label, value, truncate = true }: { label: string; value: ReactNode; truncate?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-medium text-text mt-0.5 ${truncate ? "truncate" : "break-words"}`}>{value}</p>
    </div>
  );
}

/** Lifetime-to-date performance for one Campaign/Ad Set/Ad — same visual
 * language as the Reports page's KpiCard (bg-surface + accent icon circle),
 * kept local here instead of importing that component across feature
 * boundaries since this one only ever shows metrics, not report-specific data. */
export function MetricsRow({ metrics, showLeads }: { metrics: MetaMetrics; showLeads?: boolean }) {
  const items: { icon: typeof DollarSign; label: string; value: string }[] = [
    { icon: DollarSign, label: "Spend", value: `$${metrics.spend.toLocaleString()}` },
    { icon: Eye, label: "Impressions", value: metrics.impressions.toLocaleString() },
    { icon: MousePointerClick, label: "Clicks", value: metrics.clicks.toLocaleString() },
    { icon: Percent, label: "CTR", value: `${metrics.ctr.toFixed(2)}%` },
    { icon: BarChart3, label: "CPM", value: `$${metrics.cpm.toFixed(2)}` },
    { icon: Users, label: "Reach", value: metrics.reach.toLocaleString() },
  ];
  if (showLeads) items.push({ icon: UserPlus, label: "Leads", value: String(metrics.leads) });

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.map((item) => (
        <div key={item.label} className="bg-surface rounded-lg p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary-subtle text-primary flex items-center justify-center shrink-0">
            <item.icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">{item.label}</p>
            <p className="text-lg font-bold text-text tabular-nums truncate">{item.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Mirrors the Breadcrumb chrome exactly (real nav/list/separator icons —
 * only the per-level labels shimmer, since the real labels aren't known
 * until the campaign/ad set/ad loads). `levels` is 2/3/4 depending on which
 * detail page this is (Campaign / Ad Set / Ad). */
export function DetailBreadcrumbSkeleton({ levels }: { levels: 2 | 3 | 4 }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {Array.from({ length: levels }).map((_, i) => (
          <Fragment key={i}>
            <BreadcrumbItem>
              <Skeleton className={`h-3.5 rounded ${i === levels - 1 ? "w-28" : "w-16"}`} />
            </BreadcrumbItem>
            {i < levels - 1 && <BreadcrumbSeparator />}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** Mirrors the LevelChip + title + StatusChip header row shared by all
 * three detail pages. `actionButtons` covers the trailing StatusActions
 * block — Ad's header additionally has a "Preview on Meta" button, so it
 * passes 2, Campaign/Ad Set pass the default of 1. */
export function DetailHeaderSkeleton({ actionButtons = 1 }: { actionButtons?: number }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0 flex items-center gap-2.5 flex-wrap">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-7 w-56 rounded" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {Array.from({ length: actionButtons }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-32 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** Mirrors one InfoItem's label/value shape — for composing a custom grid
 * (e.g. Ad Copy's mixed 1-col/2-col layout). `wide` is for a truncate=false
 * value that spans multiple columns (e.g. Primary Text, Destination URL). */
export function InfoItemSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Skeleton className="h-2.5 w-16 rounded" />
      <Skeleton className={`h-3.5 rounded ${wide ? "w-full max-w-md" : "w-24"}`} />
    </div>
  );
}

/** A uniform grid of InfoItemSkeletons, for the Campaign Info / Ad Set Info
 * sections where every field is the same shape. `count` should match the
 * real number of InfoItems that section renders once loaded. */
export function InfoGridSkeleton({ count, cols = "grid-cols-2 sm:grid-cols-3" }: { count: number; cols?: string }) {
  return (
    <div className={`grid ${cols} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <InfoItemSkeleton key={i} />
      ))}
    </div>
  );
}

/** Mirrors MetricsRow's tile shape exactly (icon circle + label/value
 * stack) — `count` defaults to 6 (the non-leads case); the real row may add
 * a 7th "Leads" tile once data confirms this is a lead-gen object, which is
 * an acceptable, data-dependent one-tile shift on load. */
export function MetricsRowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-surface rounded-lg p-4 flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
          <div className="min-w-0 space-y-1.5">
            <Skeleton className="h-2.5 w-14 rounded" />
            <Skeleton className="h-4.5 w-12 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Mirrors the Ad Sets/Ads child-list rows below each detail page's own
 * Info/Performance sections. `variant="twoLine"` is the Campaign page's Ad
 * Set rows (name + meta line, no thumbnail); `variant="thumbnail"` is the
 * Ad Set page's Ad rows (optional thumbnail + single name line). */
export function DetailChildRowsSkeleton({ count = 2, variant = "twoLine" }: { count?: number; variant?: "twoLine" | "thumbnail" }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="w-full flex items-center gap-3 bg-background border border-border rounded-lg px-4 py-3">
          {variant === "thumbnail" && <Skeleton className="w-10 h-10 rounded-lg shrink-0" />}
          <div className={`min-w-0 space-y-1.5 ${variant === "thumbnail" ? "flex-1" : ""}`}>
            <Skeleton className="h-3.5 w-40 rounded" />
            {variant === "twoLine" && <Skeleton className="h-2.5 w-56 rounded" />}
          </div>
          <Skeleton className="h-5 w-16 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Matches the legacy Campaign Setup wizard's CTA option set. */
export const CTA_TYPES = [
  { value: "LEARN_MORE", label: "Learn More" },
  { value: "SHOP_NOW", label: "Shop Now" },
  { value: "BOOK_TRAVEL", label: "Book Now" },
  { value: "SIGN_UP", label: "Sign Up" },
  { value: "CONTACT_US", label: "Contact Us" },
  { value: "GET_QUOTE", label: "Get Quote" },
  { value: "APPLY_NOW", label: "Apply Now" },
  { value: "SUBSCRIBE", label: "Subscribe" },
  { value: "DOWNLOAD", label: "Download" },
  { value: "GET_OFFER", label: "Get Offer" },
  { value: "ORDER_NOW", label: "Order Now" },
  { value: "WATCH_MORE", label: "Watch More" },
];

/** ISO 3166-1 alpha-2 -> flag emoji, via Unicode regional indicator symbols
 * (no library, no data file — works for literally every country code). */
export function flagEmoji(countryCode?: string): string {
  if (!countryCode || countryCode.length !== 2) return "";
  const code = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0)));
}

/** Reads the business's saved Advantage+ Audience preference — the one
 * business-level default the Launch/Add Ad Set forms pick up automatically,
 * per businesses.settings.meta_ads (jsonb, no dedicated settings UI yet —
 * same pattern as businesses.outreach_settings). */
export function useBusinessMetaAdsDefaults() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["meta-ads", "business-defaults"],
    queryFn: async () => {
      const { data } = await supabase.from("businesses").select("name, website_url, target_countries, settings").limit(1).single();
      const settings = (data?.settings as Record<string, { advantage_audience_default?: boolean }> | null) || {};
      return {
        name: data?.name as string | undefined,
        websiteUrl: (data?.website_url as string | undefined) || "",
        targetCountries: Array.isArray(data?.target_countries) ? (data!.target_countries as string[]) : null,
        advantageAudienceDefault: !!settings?.meta_ads?.advantage_audience_default,
      };
    },
  });
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-muted uppercase tracking-wide">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

/** Promoted to src/components/ui/Section.tsx once the Settings page needed
 * the identical pattern — re-exported here so every existing import from
 * "./shared" keeps working unchanged. */
export { Section } from "@/components/ui/Section";

export function PillToggle({ options, selected, onToggle }: { options: { value: string; label: string }[]; selected: string[]; onToggle: (value: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onToggle(opt.value)}
          className={`px-4 py-2 rounded-lg text-xs font-bold border transition-colors ${
            selected.includes(opt.value) ? "bg-info border-info" : "border-default text-muted hover:bg-surface"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const LOCATION_TYPE_ICON = { country: Globe, region: MapPin, city: Building2 } as const;

/** Search-as-you-type location picker backed directly by Meta's own
 * adgeolocation search (via /api/meta-ads/locations) — not a third-party
 * country library, since Meta's targeting also accepts cities/regions,
 * which need Meta's own internal location key, not just a plain name. Every
 * result Meta returns already carries a country_code, so flags come for
 * free (see flagEmoji) with no separate data file. Selecting a country
 * clears any city/region already picked inside it and vice versa, matching
 * Meta's own targeting-overlap rule. */
export function LocationSearch({ selected, setSelected }: { selected: GeoLocationEntry[]; setSelected: (next: GeoLocationEntry[]) => void }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["meta-ads", "locations", debounced],
    queryFn: async () => {
      const res = await fetch(`/api/meta-ads/locations?q=${encodeURIComponent(debounced)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to search locations");
      return data.locations as GeoLocationEntry[];
    },
    enabled: debounced.length >= 2,
  });

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const pick = (loc: GeoLocationEntry) => {
    if (selected.some((s) => s.key === loc.key && s.type === loc.type)) return;
    let next = [...selected, loc];
    if (loc.type === "country") {
      // A country supersedes any city/region already picked inside it.
      next = next.filter((s) => s.key === loc.key || s.type === "country" || s.countryCode !== loc.countryCode);
    } else {
      // A city/region supersedes the parent country, if it's already picked.
      next = next.filter((s) => !(s.type === "country" && s.countryCode === loc.countryCode));
    }
    setSelected(next);
    setQuery("");
    setOpen(false);
  };

  const remove = (loc: GeoLocationEntry) => setSelected(selected.filter((s) => !(s.key === loc.key && s.type === loc.type)));

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((loc) => (
            <span key={`${loc.type}-${loc.key}`} className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full text-xs font-bold bg-secondary text-text border border-border">
              <span>{flagEmoji(loc.countryCode) || "🌐"}</span>
              {loc.name}
              <span className="normal-case font-medium text-muted">· {loc.type}</span>
              <button type="button" onClick={() => remove(loc)} className="hover:bg-secondary-hover rounded-full p-0.5"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div ref={containerRef} className="relative">
        <div className="relative">
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Search countries, regions, or cities…"
            className="pl-9"
          />
        </div>
        {open && debounced.length >= 2 && (
          <div className="mt-1 rounded-lg border border-border bg-background shadow-md max-h-56 overflow-y-auto">
            {isFetching ? (
              <p className="p-3 text-xs text-muted">Searching…</p>
            ) : results.length === 0 ? (
              <p className="p-3 text-xs text-muted">No matches for &quot;{debounced}&quot;.</p>
            ) : (
              results.map((loc) => {
                const Icon = LOCATION_TYPE_ICON[loc.type];
                return (
                  <button
                    key={`${loc.type}-${loc.key}`}
                    type="button"
                    onClick={() => pick(loc)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface transition-colors"
                  >
                    <span className="text-base leading-none">{flagEmoji(loc.countryCode) || "🌐"}</span>
                    <span className="flex-1 min-w-0 truncate text-text">{loc.name}</span>
                    <Icon className="w-3 h-3 text-muted shrink-0" />
                    <span className="text-[10px] font-bold uppercase text-muted shrink-0">{loc.type}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export interface AdCopyState {
  adName: string;
  headline: string;
  primaryText: string;
  description: string;
  ctaType: string;
  websiteUrl: string;
  leadGenFormId: string;
}

export const DEFAULT_AD_COPY: AdCopyState = { adName: "", headline: "", primaryText: "", description: "", ctaType: "LEARN_MORE", websiteUrl: "", leadGenFormId: "" };

/** Ad Name / Headline / Primary Text / Description / CTA / Destination URL
 * — plus the Instant Form picker when this ad set is (or will be) built for
 * native Lead Gen Forms. Shared by the Launch wizard's step 3, "+ Add Ad
 * Set", and "+ Add Creative" — every place that creates a new Ad needs
 * exactly these fields. */
export function AdCopyFields({
  state,
  setState,
  showLeadForm,
  leadFormRequired,
}: {
  state: AdCopyState;
  setState: (patch: Partial<AdCopyState>) => void;
  showLeadForm: boolean;
  leadFormRequired?: boolean;
}) {
  const { data: leadForms } = useLeadForms();
  // Meta rejects an ad whose call_to_action points at a non-ACTIVE form
  // (draft or archived) — useLeadForms() intentionally returns every form,
  // archived included, for the Instant Forms management table, so this
  // picker narrows it back down to only what's actually usable on an ad.
  const activeLeadForms = leadForms?.filter((f) => f.status === "ACTIVE");

  return (
    <div className="space-y-4">
      {showLeadForm && (
        <Field label="Instant Form" hint={leadFormRequired ? "This ad set only accepts Instant Form leads." : "Leave unset to send clicks to your website instead."}>
          {leadForms === undefined ? (
            <p className="text-xs text-muted">Lead forms need Page setup first — see the Leads tab.</p>
          ) : !activeLeadForms?.length ? (
            <p className="text-xs text-muted">No active Instant Forms yet — create one in the Leads tab (draft/archived forms aren&apos;t usable on an ad).</p>
          ) : (
            <Dropdown
              value={state.leadGenFormId || (leadFormRequired ? "" : "none")}
              onValueChange={(v) => setState({ leadGenFormId: v === "none" ? "" : v })}
              placeholder="Select a form"
              options={[
                ...(!leadFormRequired ? [{ value: "none", label: "Use website instead" }] : []),
                ...activeLeadForms.map((f) => ({ value: f.id, label: f.name })),
              ]}
            />
          )}
        </Field>
      )}

      <Field label="Ad Name">
        <Input value={state.adName} onChange={(e) => setState({ adName: e.target.value })} placeholder="e.g. Corporate Workspace — Video v1" />
      </Field>

      <Field label="Headline">
        <Input value={state.headline} onChange={(e) => setState({ headline: e.target.value })} maxLength={80} placeholder="Max 6 words, one specific benefit" />
      </Field>
      <Field label="Primary Text">
        <Textarea value={state.primaryText} onChange={(e) => setState({ primaryText: e.target.value })} rows={3} placeholder="2-4 short sentences" />
      </Field>
      <Field label="Description (optional)" hint="A short secondary line Meta shows below the headline.">
        <Input value={state.description} onChange={(e) => setState({ description: e.target.value })} maxLength={30} placeholder="e.g. Limited slots. Free consult." />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Call to Action (CTA)">
          <Dropdown value={state.ctaType} onValueChange={(v) => setState({ ctaType: v })} options={CTA_TYPES} />
        </Field>
        {!(leadFormRequired || (showLeadForm && state.leadGenFormId)) && (
          <Field label="Destination URL">
            <Input value={state.websiteUrl} onChange={(e) => setState({ websiteUrl: e.target.value })} placeholder="https://" />
          </Field>
        )}
      </div>
    </div>
  );
}

export interface TargetingState {
  locations: GeoLocationEntry[];
  ageMin: number;
  ageMax: number;
  gender: 0 | 1 | 2;
  optimizationGoal: string;
  advantageAudience: boolean;
  placementsMode: "advantage_plus" | "manual";
  publisherPlatforms: string[];
  facebookPositions: string[];
  instagramPositions: string[];
}

export const DEFAULT_TARGETING: TargetingState = {
  locations: [{ key: "US", name: "United States", type: "country", countryCode: "US" }],
  ageMin: 25,
  ageMax: 65,
  gender: 0,
  optimizationGoal: "",
  advantageAudience: false,
  placementsMode: "advantage_plus",
  publisherPlatforms: ["facebook", "instagram"],
  facebookPositions: ["feed", "story", "reels"],
  instagramPositions: ["stream", "story", "reels"],
};

/** Splits the wizard's flat `locations` list into the shape the backend
 * expects (TargetingInput.geoLocations). */
export function toGeoLocations(locations: GeoLocationEntry[]) {
  return {
    countries: locations.filter((l) => l.type === "country").map((l) => l.key),
    regions: locations.filter((l) => l.type === "region").map((l) => l.key),
    cities: locations.filter((l) => l.type === "city").map((l) => l.key),
  };
}

const FB_POSITIONS = [
  { value: "feed", label: "Feed" },
  { value: "story", label: "Stories" },
  { value: "reels", label: "Reels" },
  { value: "right_hand_column", label: "Right Column" },
  { value: "video_feeds", label: "Video Feeds" },
];
const IG_POSITIONS = [
  { value: "stream", label: "Feed" },
  { value: "story", label: "Stories" },
  { value: "reels", label: "Reels" },
  { value: "explore", label: "Explore" },
];

/** Who should see this ad — location search, age/gender, and Advantage+
 * Audience. Shared by the Launch wizard's Ad Set step and "+ Add Ad Set". */
export function AudienceFields({ state, setState }: { state: TargetingState; setState: (patch: Partial<TargetingState>) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Locations">
        <LocationSearch selected={state.locations} setSelected={(locations) => setState({ locations })} />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Min age"><Input type="number" min="18" max="65" value={state.ageMin} onChange={(e) => setState({ ageMin: Number(e.target.value) })} /></Field>
        <Field label="Max age"><Input type="number" min="18" max="65" value={state.ageMax} onChange={(e) => setState({ ageMax: Number(e.target.value) })} /></Field>
        <Field label="Gender">
          <Dropdown
            value={String(state.gender)}
            onValueChange={(v) => setState({ gender: Number(v) as 0 | 1 | 2 })}
            options={[{ value: "0", label: "All" }, { value: "1", label: "Male" }, { value: "2", label: "Female" }]}
          />
        </Field>
      </div>

      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={state.advantageAudience}
          onChange={(e) => setState({ advantageAudience: e.target.checked })}
          className="mt-0.5 w-4 h-4 rounded border-border accent-primary"
        />
        <span className="text-xs text-text">
          <span className="font-semibold">Advantage+ Audience</span>
          <span className="block text-muted">Let Meta expand this targeting automatically when it finds better results.</span>
        </span>
      </label>
    </div>
  );
}

const PLATFORM_OPTIONS = [
  { value: "facebook", label: "Facebook", Icon: SiFacebook },
  { value: "instagram", label: "Instagram", Icon: SiInstagram },
] as const;

/** What Meta optimizes for and where the ad can show. Shared by the Launch
 * wizard's Ad Set step and "+ Add Ad Set". */
export function DeliveryFields({ state, setState, objective }: { state: TargetingState; setState: (patch: Partial<TargetingState>) => void; objective: MetaObjective }) {
  const goals = OBJECTIVE_GOALS[objective];
  const togglePlatform = (platform: string) =>
    setState({ publisherPlatforms: state.publisherPlatforms.includes(platform) ? state.publisherPlatforms.filter((p) => p !== platform) : [...state.publisherPlatforms, platform] });
  const toggleFbPosition = (v: string) =>
    setState({ facebookPositions: state.facebookPositions.includes(v) ? state.facebookPositions.filter((p) => p !== v) : [...state.facebookPositions, v] });
  const toggleIgPosition = (v: string) =>
    setState({ instagramPositions: state.instagramPositions.includes(v) ? state.instagramPositions.filter((p) => p !== v) : [...state.instagramPositions, v] });

  return (
    <div className="space-y-4">
      <Field label="Optimization Goal" hint={objective === "OUTCOME_LEADS" ? "Attaching an Instant Form in the next step will automatically switch this to Lead Generation." : "What Meta's delivery algorithm chases within this objective."}>
        <Dropdown value={state.optimizationGoal || goals[0].value} onValueChange={(v) => setState({ optimizationGoal: v })} options={goals} />
      </Field>

      <Field label="Placements">
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setState({ placementsMode: "advantage_plus" })}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${state.placementsMode === "advantage_plus" ? "bg-info border-info" : "border-default text-muted hover:bg-surface"}`}
          >
            Advantage+ (recommended)
          </button>
          <button
            type="button"
            onClick={() => setState({ placementsMode: "manual" })}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${state.placementsMode === "manual" ? "bg-info border-info" : "border-default text-muted hover:bg-surface"}`}
          >
            Manual
          </button>
        </div>
        {state.placementsMode === "manual" && (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div>
              <p className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">Platform</p>
              <div className="flex flex-wrap gap-2">
                {PLATFORM_OPTIONS.map(({ value, label, Icon }) => {
                  const isSelected = state.publisherPlatforms.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => togglePlatform(value)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${isSelected ? "bg-info border-info" : "border-default text-muted hover:bg-surface"}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {state.publisherPlatforms.includes("facebook") && (
              <div>
                <p className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">Facebook Positions</p>
                <PillToggle options={FB_POSITIONS} selected={state.facebookPositions} onToggle={toggleFbPosition} />
              </div>
            )}
            {state.publisherPlatforms.includes("instagram") && (
              <div>
                <p className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">Instagram Positions</p>
                <PillToggle options={IG_POSITIONS} selected={state.instagramPositions} onToggle={toggleIgPosition} />
              </div>
            )}
          </div>
        )}
      </Field>
    </div>
  );
}

export interface BudgetState {
  budgetType: BudgetType;
  dailyDollars: string;
  lifetimeDollars: string;
}

export const DEFAULT_BUDGET: BudgetState = { budgetType: "daily", dailyDollars: "15", lifetimeDollars: "100" };

/** Meta's real Lifetime Budget minimum — roughly $3 for a 1-day campaign,
 * +$1 per additional day. A Lifetime budget always needs an end date so
 * this can even be computed; Daily has no such requirement. Kept as a pure,
 * client-safe copy of launch.service.ts's identical server-side formula
 * (that file also imports server-only env/graph-client code, so it can't
 * be imported directly from client components). */
export function minLifetimeBudgetCents(startAt: Date | undefined, endAt: Date | undefined): number | null {
  if (!endAt) return null;
  const start = startAt || new Date();
  const days = Math.max(1, Math.ceil((endAt.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
  return (days + 2) * 100;
}

/** Same $1/day floor the Lifetime formula above is built on — Meta's real
 * minimum varies by currency/optimization event, but this matches the
 * `min="1"` already enforced on the Daily input. */
export const MIN_DAILY_BUDGET_CENTS = 100;

/** Budget Type (Daily/Lifetime) + Amount — Lifetime shows Meta's real live
 * minimum for the currently-picked date range and requires an End Date,
 * exactly like the legacy project's wizard. Shared by the Launch wizard and
 * "+ Add Ad Set". */
export function BudgetFields({ state, setState, startAt, endAt }: { state: BudgetState; setState: (patch: Partial<BudgetState>) => void; startAt: Date | undefined; endAt: Date | undefined }) {
  const minCents = state.budgetType === "lifetime" ? minLifetimeBudgetCents(startAt, endAt) : null;
  return (
    <div className="space-y-4">
      <Field label="Budget Type" hint="Daily spends a set amount every day, no end date required. Lifetime spends a fixed total over a date range you set — Meta requires an End Date to know how to pace it.">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setState({ budgetType: "daily" })}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${state.budgetType === "daily" ? "bg-info border-info" : "border-default text-muted hover:bg-surface"}`}
          >
            Daily Budget
          </button>
          <button
            type="button"
            onClick={() => setState({ budgetType: "lifetime" })}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${state.budgetType === "lifetime" ? "bg-info border-info" : "border-default text-muted hover:bg-surface"}`}
          >
            Lifetime Budget
          </button>
        </div>
      </Field>
      {state.budgetType === "daily" ? (
        <Field label="Daily Budget (USD)" hint={`Minimum: $${(MIN_DAILY_BUDGET_CENTS / 100).toFixed(2)}`}>
          <Input type="number" min="1" step="1" value={state.dailyDollars} onChange={(e) => setState({ dailyDollars: e.target.value })} />
        </Field>
      ) : (
        <Field
          label="Lifetime Budget (USD)"
          hint={!endAt ? "Set an End Date below first — Lifetime budgets require one." : minCents ? `Minimum for this date range: $${(minCents / 100).toFixed(2)}` : undefined}
        >
          <Input type="number" min="1" step="1" value={state.lifetimeDollars} onChange={(e) => setState({ lifetimeDollars: e.target.value })} />
        </Field>
      )}
    </div>
  );
}
