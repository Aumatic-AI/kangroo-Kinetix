export type CreativeStatus = "pending" | "processing" | "review" | "approved" | "failed";
export type CreativeType = "video" | "image";

export interface MetaAdCreative {
  id: string;
  created_at: string;
  business_id: string;
  type: CreativeType;
  status: CreativeStatus;
  service?: string | null;
  idea_prompt?: string;
  ad_script?: any;
  media_urls?: string[];
  media_asset_id?: string | null;
  revision_history?: any[];
  video_style?: string;
  audio_style?: string;
  language?: string;
  character_type?: string;
  duration?: string;
  voice_id?: string;
  aspect_ratio?: string;
}

/** What the Ad Library grid actually fetches — getCreatives() only selects
 * these columns (see meta-ads.service.ts), unlike getCreativeById()'s full
 * MetaAdCreative row used for edit/retry. created_at is needed by the
 * Ad Library's polling schedule (see src/lib/generation-polling.ts), not
 * displayed anywhere. */
export interface MetaAdCreativeListItem {
  id: string;
  type: CreativeType;
  status: CreativeStatus;
  media_urls?: string[];
  duration?: string;
  created_at: string;
  aspect_ratio?: string;
  /** Set only for creatives generated via AI Ad Studio — lets the Ad
   * Library link back to that session's chat history. Null for creatives
   * from the plain Create Ad flow. */
  studio_session_id?: string | null;
}

/** What the campaign "pick a creative" dialog fetches — getCreativesForPicker()
 * selects these columns, wider than MetaAdCreativeListItem because
 * CreateCampaignPage pre-fills ad copy (name/headline/primary text) from
 * idea_prompt/ad_script/service once a creative is picked. */
export interface MetaAdCreativePickerItem {
  id: string;
  type: CreativeType;
  status: CreativeStatus;
  service?: string | null;
  idea_prompt?: string;
  ad_script?: any;
  media_urls?: string[];
  duration?: string;
  aspect_ratio?: string;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface CreativeFilters {
  status?: CreativeStatus;
  type?: CreativeType;
  search?: string;
}

// ============================================================
// CAMPAIGNS — our own pointer rows (campaigns/ad_sets/ads), plus
// the live-fetched Meta shapes joined against them. See
// src/modules/meta-ads/services/campaigns.service.ts for how these
// are read/written.
// ============================================================

export type CampaignStatus = "draft" | "active" | "paused" | "completed" | "archived";

export interface Campaign {
  id: string;
  created_at: string;
  updated_at: string;
  business_id: string;
  name: string;
  objective: string | null;
  status: CampaignStatus;
  daily_budget_cents: number | null;
  lifetime_budget_cents: number | null;
  currency: string;
  start_at: string | null;
  end_at: string | null;
  ad_account_id: string | null;
  external_campaign_id: string | null;
}

/** What the Campaigns list actually fetches from our own `campaigns` table —
 * getCampaignsByBusiness() only selects these columns (see
 * campaigns.service.ts). Budget lives on CampaignPageDetail instead, fetched
 * live only when a single campaign's detail page is opened. */
export interface CampaignListRow {
  id: string;
  created_at: string;
  name: string;
  objective: string | null;
  status: CampaignStatus;
  external_campaign_id: string | null;
}

export interface AdSet {
  id: string;
  created_at: string;
  business_id: string;
  campaign_id: string;
  name: string;
  status: CampaignStatus;
  daily_budget_cents: number | null;
  lifetime_budget_cents: number | null;
  targeting: any;
  placements: any;
  optimization_goal: string | null;
  bid_strategy: string | null;
  start_at: string | null;
  end_at: string | null;
  external_adset_id: string | null;
}

export interface Ad {
  id: string;
  created_at: string;
  business_id: string;
  ad_set_id: string;
  name: string;
  status: CampaignStatus;
  creative_id: string | null;
  external_ad_id: string | null;
  external_creative_id: string | null;
}

export type MetaObjective = "OUTCOME_TRAFFIC" | "OUTCOME_LEADS" | "OUTCOME_SALES" | "OUTCOME_AWARENESS" | "OUTCOME_ENGAGEMENT";

/** Objective -> the optimization goals Meta allows for it. First entry is
 * the recommended default. Mirrors the legacy project's OBJECTIVE_GOAL_MAP. */
export const OBJECTIVE_GOALS: Record<MetaObjective, { value: string; label: string }[]> = {
  OUTCOME_AWARENESS: [
    { value: "REACH", label: "Reach" },
    { value: "IMPRESSIONS", label: "Impressions" },
  ],
  OUTCOME_TRAFFIC: [
    { value: "LINK_CLICKS", label: "Link Clicks" },
    { value: "LANDING_PAGE_VIEWS", label: "Landing Page Views" },
    { value: "REACH", label: "Reach" },
  ],
  OUTCOME_ENGAGEMENT: [
    { value: "POST_ENGAGEMENT", label: "Post Engagement" },
    { value: "LINK_CLICKS", label: "Link Clicks" },
    { value: "REACH", label: "Reach" },
  ],
  OUTCOME_LEADS: [
    { value: "LEAD_GENERATION", label: "Lead Generation (Instant Form)" },
    { value: "LINK_CLICKS", label: "Link Clicks" },
    { value: "QUALITY_LEAD", label: "Quality Lead" },
  ],
  OUTCOME_SALES: [
    { value: "OFFSITE_CONVERSIONS", label: "Conversions" },
    { value: "LINK_CLICKS", label: "Link Clicks" },
  ],
};

/** One resolved geo-targeting entry — Meta's own key (not just an ISO code
 * for regions/cities), sourced from /api/meta-ads/locations, which proxies
 * Meta's own adgeolocation search. "country" entries use their ISO code as
 * the key, matching what Meta's `geo_locations.countries` expects directly. */
export interface GeoLocationEntry {
  key: string;
  name: string;
  type: "country" | "region" | "city";
  countryCode?: string;
}

/** Ad-copy fields — the same shape needed anywhere a new Ad gets created:
 * the main Launch wizard, "+ Add Ad Set" on an existing campaign, and
 * "+ Add Creative" on an existing ad set. */
export interface AdCopyInput {
  creativeId: string;
  /** The Ad object's own name in Meta — distinct from the campaign/ad-set
   * name, since one campaign can end up holding several differently-named
   * ads over time (see "+ Add Creative"). */
  adName: string;
  /** Image creatives prefill this from ad_script.headline/primary_text —
   * video creatives only ever generated a voiceover script, never on-platform
   * ad copy, so these are always blank and required for video launches. */
  headline: string;
  primaryText: string;
  /** Optional secondary line Meta shows below the headline
   * (object_story_spec.link_data.description for image ads,
   * video_data.link_description for video ads). */
  description?: string;
  ctaType: string;
  websiteUrl: string;
  /** Native Instant Form id — when set, the ad set's objective must be
   * OUTCOME_LEADS and no pixel is needed (promoted_object references the
   * Page instead). */
  leadGenFormId?: string;
}

/** Daily runs indefinitely (or until an optional end date); Lifetime spends
 * a fixed total over a start->end window Meta requires up front, so it can
 * pace spend across the whole period. */
export type BudgetType = "daily" | "lifetime";

/** Targeting + delivery fields — the same shape needed for a new Ad Set,
 * whether it's the campaign's first one (Launch) or an additional one
 * (+ Add Ad Set on an existing campaign). Deliberately simple for v1 — no
 * custom audiences/interest layers. */
export interface TargetingInput {
  geoLocations: { countries: string[]; regions: string[]; cities: string[] };
  ageMin: number;
  ageMax: number;
  /** 0 = all, 1 = male, 2 = female — matches Meta's own targeting.genders vocabulary. */
  gender: 0 | 1 | 2;
  /** Advantage+ Audience — let Meta expand targeting beyond what's specified
   * here when it finds better results. Defaults from the business's saved
   * preference (businesses.settings.meta_ads.advantage_audience_default). */
  advantageAudience?: boolean;
  optimizationGoal?: string;
  /** "advantage_plus" (default, recommended — Meta auto-picks placements) or
   * "manual" (send explicit publisher_platforms/facebook_positions/instagram_positions). */
  placementsMode?: "advantage_plus" | "manual";
  publisherPlatforms?: string[];
  facebookPositions?: string[];
  instagramPositions?: string[];
  startAt?: string;
  endAt?: string;
}

/** Where the budget lives (Campaign if CBO, this Ad Set if not) always
 * carries both a type and the matching amount — see BudgetType. */
export interface BudgetInput {
  budgetType: BudgetType;
  dailyBudgetCents?: number;
  lifetimeBudgetCents?: number;
}

/** What the Launch wizard collects — always creates a brand-new Campaign +
 * Ad Set + Ad. Adding to an *existing* campaign/ad set is a different,
 * separate action (see CreateAdSetInput/CreateAdInput below) triggered from
 * the Campaign Details view instead, not from this wizard. */
export interface LaunchCampaignInput extends AdCopyInput, TargetingInput, BudgetInput {
  campaignName: string;
  objective: MetaObjective;
  /** Auction (the default — nearly every account) or Reach and Frequency
   * (a fixed-CPM, reserved buy that needs a Meta ad rep/managed account;
   * most self-serve ad accounts can't actually use it, but it's a real
   * Meta campaign field so the option is here). */
  buyingType?: "AUCTION" | "RESERVED";
  /** Campaign Budget Optimization — true puts the budget on the Campaign
   * (shared across its ad sets); false (default) puts it on this first Ad
   * Set instead. */
  cbo: boolean;
  adSetName: string;
}

/** "+ Add Ad Set" on an existing campaign (Campaign Detail page) — creates
 * an empty Ad Set under a campaign that already exists, with no ad/creative
 * yet (Meta allows an Ad Set with zero Ads — one gets added afterward from
 * the Ad Set Detail page's "Create Ad" action instead). */
export interface CreateAdSetInput extends TargetingInput {
  adSetName: string;
  /** Omitted/ignored when the parent campaign is CBO — the new ad set draws
   * from the campaign's shared budget instead of having its own. */
  budgetType?: BudgetType;
  dailyBudgetCents?: number;
  lifetimeBudgetCents?: number;
}

/** "+ Add Creative" on an existing Ad Set (Campaign Details view) — creates
 * a new Ad under an ad set that already exists, inheriting its targeting/
 * budget/optimization goal untouched. */
export type CreateAdInput = AdCopyInput;

/** One row of the Campaigns tab's live-fetched list — our own row's
 * business/creative pointer merged with Meta's current status/budget. */
export interface CampaignListItem {
  id: string;
  externalCampaignId: string;
  name: string;
  objective: string | null;
  status: string;
  createdAt: string;
  adSetCount: number;
  adCount: number;
}

/** Spend/delivery numbers shown on every detail page — lifetime-to-date
 * (date_preset=maximum), fetched live from Meta's Insights API, never
 * stored. Zeroed out (not omitted) when Meta has no insights yet, e.g. a
 * campaign that's never had any delivery. */
export interface MetaMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  reach: number;
  leads: number;
}

/** /meta-ads/campaigns/[campaignId] — the campaign's own fields plus the
 * list of its Ad Sets (counts only, never their Ads — drilling into one
 * Ad Set's Ads is a separate page, AdSetPageDetail below). */
export interface CampaignPageDetail {
  id: string;
  externalCampaignId: string;
  name: string;
  objective: string | null;
  status: string;
  buyingType: string | null;
  dailyBudgetCents: number | null;
  lifetimeBudgetCents: number | null;
  currency: string;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  adSetCount: number;
  adCount: number;
  metrics: MetaMetrics;
  adSets: Array<{
    id: string;
    externalAdsetId: string;
    name: string;
    status: string;
    dailyBudgetCents: number | null;
    lifetimeBudgetCents: number | null;
    optimizationGoal: string | null;
    adCount: number;
  }>;
}

/** /meta-ads/campaigns/[campaignId]/[adSetId] — the ad set's own targeting/
 * delivery/budget fields plus the list of its Ads (basic fields only —
 * opening one Ad's full copy/creative is a separate page, AdPageDetail
 * below). Targeting/placements are read from our own pointer row (set once
 * at creation and not something Meta lets you silently change outside this
 * app), unlike status/budget which are always re-fetched live. */
export interface AdSetPageDetail {
  id: string;
  externalAdsetId: string;
  campaignId: string;
  campaignName: string;
  name: string;
  status: string;
  dailyBudgetCents: number | null;
  lifetimeBudgetCents: number | null;
  optimizationGoal: string | null;
  bidStrategy: string | null;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  targetingSummary: {
    countries: string[];
    regions: string[];
    cities: string[];
    ageMin: number | null;
    ageMax: number | null;
    genders: number[];
    advantageAudience: boolean;
  };
  placementsSummary: {
    mode: "advantage_plus" | "manual";
    publisherPlatforms: string[];
    facebookPositions: string[];
    instagramPositions: string[];
  };
  metrics: MetaMetrics;
  ads: Array<{
    id: string;
    externalAdId: string;
    name: string;
    status: string;
    thumbnailUrl?: string;
  }>;
}

/** /meta-ads/campaigns/[campaignId]/[adSetId]/[adId] — everything about one
 * Ad: its creative preview + copy, and its own metrics. */
export interface AdPageDetail {
  id: string;
  externalAdId: string;
  adSetId: string;
  adSetName: string;
  campaignId: string;
  campaignName: string;
  name: string;
  status: string;
  creativeId: string | null;
  externalCreativeId: string | null;
  mediaUrl?: string;
  mediaType: "video" | "image";
  headline: string | null;
  primaryText: string | null;
  description: string | null;
  ctaType: string | null;
  destinationUrl: string | null;
  leadGenFormId: string | null;
  previewShareableLink: string | null;
  createdAt: string;
  metrics: MetaMetrics;
}
