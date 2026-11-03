/** One row of the Listings table — deliberately limited. Everything else is
 * fetched on demand when a row is opened (see ListingDetail). */
export interface ListingSummary {
  id: string;
  title: string;
  city: string | null;
  spaceCategory: string | null;
  status: ListingStatus;
  thumbnailUrl: string | null;
  /** Most recent successful promotion across Testing and Live, or null. */
  lastPromotedAt: string | null;
}

export type ListingStatus = "active" | "inactive";
export type ListingEnvironment = "testing" | "live";
export type ImageValidation = "unchecked" | "ok" | "broken";

export interface ListingImage {
  id: string;
  position: number;
  url: string;
  validationStatus: ImageValidation;
}

/** Per-environment promotion/content numbers, derived by the
 * property_promotion_stats view — never stored counters. */
export interface ListingEnvStats {
  environment: ListingEnvironment;
  generatedCount: number;
  socialGeneratedCount: number;
  linkedinGeneratedCount: number;
  failedGenerationCount: number;
  inFlightCount: number;
  contentCount: number;
  publishedContentCount: number;
  lastGeneratedAt: string | null;
  lastPublishedAt: string | null;
}

export interface ListingPromotion {
  id: string;
  environment: ListingEnvironment;
  pipelineType: "social" | "linkedin";
  status: "claimed" | "generated" | "failed" | "released";
  claimedAt: string;
  generatedAt: string | null;
  failureReason: string | null;
}

export interface ListingContentItem {
  id: string;
  environment: ListingEnvironment;
  pipelineType: "social" | "linkedin";
  contentType: "video" | "image" | "text_image";
  generationStatus: "pending" | "processing" | "completed" | "failed" | "cancelled";
  createdAt: string;
  archived: boolean;
}

export type LocationVerified = "unverified" | "verified" | "ambiguous";

export interface ListingEligibility {
  eligible: boolean;
  /** Why it is NOT in the rotation; null when eligible. */
  reason: string | null;
}

export interface ListingDetail extends ListingSummary {
  eventTypes: string[];
  locationRaw: string | null;
  region: string | null;
  country: string | null;
  timezone: string | null;
  locationVerified: LocationVerified;
  rotationSeq: number;
  images: ListingImage[];
  eligibility: ListingEligibility;
  stats: ListingEnvStats[];
  promotions: ListingPromotion[];
  content: ListingContentItem[];
}

export interface ListingFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: ListingStatus;
  category?: string;
}

export interface ListingsResponse {
  listings: ListingSummary[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
  categories: string[];
  counts: { active: number; inactive: number };
}
