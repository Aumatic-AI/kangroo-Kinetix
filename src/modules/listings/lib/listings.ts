// Pure helpers for the Listings API/UI. Type-only imports so the logic can be
// unit-tested under plain Node (scripts/tests/listings-lib.test.mjs).
import type { ImageValidation, ListingEligibility, ListingStatus, ListingSummary } from "../types/listings.types";

/** Strips everything that is special to PostgREST's `or(...)` grammar or to
 * LIKE patterns, so user input can only ever act as a plain substring. */
export function sanitizeSearch(raw: string | null | undefined): string {
  return (raw ?? "")
    .normalize("NFKC")
    .replace(/[%_\\,()*"'`:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** The `or=` filter matching title, city or category. Empty when there is no search. */
export function searchOrFilter(raw: string | null | undefined): string | null {
  const q = sanitizeSearch(raw);
  if (!q) return null;
  return `title.ilike.%${q}%,city.ilike.%${q}%,space_category.ilike.%${q}%`;
}

export function parseStatus(value: string | null | undefined): ListingStatus | undefined {
  return value === "active" || value === "inactive" ? value : undefined;
}

/** Clamps untrusted paging input to sane bounds. */
export function parsePaging(page: string | null, limit: string | null, maxLimit = 50): { page: number; limit: number } {
  const p = Math.floor(Number(page));
  const l = Math.floor(Number(limit));
  return {
    page: Number.isFinite(p) && p >= 1 ? p : 1,
    limit: Number.isFinite(l) && l >= 1 ? Math.min(l, maxLimit) : 10,
  };
}

/** Same rule the rotation uses: active, with at least one image that is not known-broken. */
export function rotationEligibility(status: ListingStatus, images: { validationStatus: ImageValidation }[]): ListingEligibility {
  if (status !== "active") return { eligible: false, reason: "Listing is inactive" };
  if (!images.some((i) => i.validationStatus !== "broken")) return { eligible: false, reason: "No usable reference image" };
  return { eligible: true, reason: null };
}

export function latestIso(...dates: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const d of dates) {
    if (d && (best === null || new Date(d).getTime() > new Date(best).getTime())) best = d;
  }
  return best;
}

interface SummaryRow {
  id: string;
  title: string;
  city: string | null;
  space_category: string | null;
  status: string;
  property_images?: { url: string; position: number }[] | null;
}

export function toSummary(row: SummaryRow, lastPromotedAt: string | null): ListingSummary {
  const thumb = [...(row.property_images ?? [])].sort((a, b) => a.position - b.position)[0];
  return {
    id: row.id,
    title: row.title,
    city: row.city,
    spaceCategory: row.space_category,
    status: row.status === "inactive" ? "inactive" : "active",
    thumbnailUrl: thumb?.url ?? null,
    lastPromotedAt,
  };
}

export const ENVIRONMENT_LABEL = { testing: "Testing", live: "Live" } as const;
export const PIPELINE_LABEL = { social: "Social", linkedin: "LinkedIn" } as const;
export const CONTENT_TYPE_LABEL = { video: "Video", image: "Image", text_image: "Text + image" } as const;

export const MAX_LISTING_IMAGES = 5;

export interface NewListingInput {
  title: string;
  spaceCategory: string | null;
  city: string | null;
  eventTypes: string[];
  imageUrls: string[];
}

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Validates a create-listing body. Event types may arrive as an array or a
 * comma-separated string; duplicates (case-insensitive) are dropped. */
export function parseNewListing(body: unknown): { ok: true; value: NewListingInput } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const title = clean(b.title, 200);
  if (!title) return { ok: false, error: "Name is required" };

  const rawEvents = Array.isArray(b.eventTypes) ? b.eventTypes : typeof b.eventTypes === "string" ? b.eventTypes.split(",") : [];
  const seen = new Set<string>();
  const eventTypes: string[] = [];
  for (const e of rawEvents) {
    const s = clean(e, 60);
    if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); eventTypes.push(s); }
  }
  if (eventTypes.length > 30) return { ok: false, error: "Too many event types (max 30)" };

  const imageUrls = Array.isArray(b.imageUrls) ? b.imageUrls.filter((u): u is string => typeof u === "string").map((u) => u.trim()).filter(Boolean) : [];
  if (imageUrls.length === 0) return { ok: false, error: "Add at least one photo" };
  if (imageUrls.length > MAX_LISTING_IMAGES) return { ok: false, error: `At most ${MAX_LISTING_IMAGES} photos` };
  if (!imageUrls.every(isHttpUrl)) return { ok: false, error: "Every photo must be an http(s) URL" };

  return { ok: true, value: { title, spaceCategory: clean(b.spaceCategory, 100), city: clean(b.city, 100), eventTypes, imageUrls } };
}
