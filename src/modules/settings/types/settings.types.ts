/**
 * Shape of GET/POST /api/settings — camelCase mirror of the businesses
 * table's columns that are actually read somewhere in the app today
 * (see src/store/business.store.ts's OutreachSettings/BusinessService,
 * src/modules/meta-ads/components/campaigns/shared.tsx's
 * useBusinessMetaAdsDefaults).
 * businesses.keywords/guidelines are deliberately left out — they have no
 * defined shape and nothing in the app reads them yet, so building a
 * settings UI for them would just be guessing. business_colors now has a
 * defined (if minimal) shape — `{ primary?: string }` — read by AI Ad
 * Studio's video generation for real branded signage/graphics (see
 * `brandColor` below).
 */

export interface BusinessServiceInput {
  name: string;
  description?: string;
}

export interface OutreachSettingsInput {
  dailyLimit: number;
  timezone: string;
  /** 0 (Sunday) – 6 (Saturday), matching JS Date.getDay(). */
  days: number[];
  sendWindow: { from: string; to: string };
}

export interface BusinessSettings {
  name: string;
  industry: string;
  description: string;
  websiteUrl: string;
  logoUrl: string | null;
  contactPhone: string;
  brandColor: string | null;
  toneOfVoice: string;
  businessVoice: string;
  coreOfferings: string;
  painPoints: string;
  targetAudience: string;
  services: BusinessServiceInput[];
  targetCountries: string[];
  outreachSettings: OutreachSettingsInput;
  metaAdsAdvantageAudienceDefault: boolean;
  videoReferenceEnabled: boolean;
  videoReferenceMaleUrl: string | null;
  videoReferenceFemaleUrl: string | null;
}
