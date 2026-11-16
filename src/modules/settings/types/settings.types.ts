/**
 * Shape of GET/POST /api/settings — camelCase mirror of the businesses
 * table's columns edited on the Settings page.
 * businesses.keywords/guidelines are deliberately left out — they have no
 * defined shape and nothing in the app reads them yet, so building a
 * settings UI for them would just be guessing. business_colors now has a
 * defined (if minimal) shape — `{ primary?: string }` — read by AI Ad
 * Studio's video generation for real branded signage/graphics (see
 * `brandColor` below).
 */

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
  targetCountries: string[];
}
