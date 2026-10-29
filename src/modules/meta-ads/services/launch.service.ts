/**
 * The one genuinely intricate part of the Meta Ads module — turning a
 * finished Ad Library creative into a real Campaign -> Ad Set -> Creative
 * -> Ad on Meta. Ported from the legacy project's /api/meta/launch route
 * (media upload + video-ready polling, Page resolution, pixel
 * auto-discover/create, DSA fields), cleaned up into named steps instead
 * of one 600-line function. Every new object is created PAUSED — Launch
 * never spends money by itself; going live is a separate, explicit Smart
 * Run/Resume action (see /api/meta-ads/campaigns/status).
 */
import { graphGet, graphPost, graphPostForm } from "@/services/meta/graph-client";
import { env } from "@/config";
import { MetaObjective, TargetingInput, BudgetInput } from "../types/meta-ads.types";

export interface UploadedMedia {
  isVideo: boolean;
  videoId?: string;
  imageHash: string;
}

export async function uploadMediaToMeta(mediaUrl: string, isVideo: boolean, accessToken: string, adAccountId: string): Promise<UploadedMedia> {
  if (!mediaUrl.startsWith("http://") && !mediaUrl.startsWith("https://")) {
    throw new Error(`Invalid media URL: ${mediaUrl}`);
  }

  if (!isVideo) {
    const imgRes = await fetch(mediaUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch image from ${mediaUrl}`);
    const blob = new Blob([await imgRes.arrayBuffer()]);
    const form = new FormData();
    form.append("source", blob, "ad_image.jpg");
    const uploadData = await graphPostForm<{ images?: Record<string, { hash: string }> }>(`act_${adAccountId}/adimages`, accessToken, form);
    const imageHash = uploadData.images?.["ad_image.jpg"]?.hash;
    if (!imageHash) throw new Error("Meta didn't return an image hash for the upload.");
    return { isVideo: false, imageHash };
  }

  const uploadForm = new FormData();
  uploadForm.append("file_url", mediaUrl);
  const uploadData = await graphPostForm<{ id?: string }>(`act_${adAccountId}/advideos`, accessToken, uploadForm);
  const videoId = uploadData.id;
  if (!videoId) throw new Error("Meta didn't return a video id for the upload.");

  let ready = false;
  for (let i = 0; i < 15; i++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      const status = await graphGet<{ status?: { video_status?: string } }>(videoId, accessToken, { fields: "status" });
      if (status.status?.video_status === "ready") {
        ready = true;
        break;
      }
    } catch {
      // keep polling — a transient failure here shouldn't abort the whole launch
    }
  }
  if (!ready) {
    console.warn(`[meta-ads/launch] video ${videoId} still processing after 45s — proceeding anyway`);
  }

  let imageHash: string | null = null;
  try {
    const pic = await graphGet<{ picture?: string }>(videoId, accessToken, { fields: "picture" });
    if (pic.picture) {
      const imgRes = await fetch(pic.picture);
      if (imgRes.ok) {
        const blob = new Blob([await imgRes.arrayBuffer()], { type: "image/jpeg" });
        const thumbForm = new FormData();
        thumbForm.append("source", blob, "video_thumb.jpg");
        const thumbUpload = await graphPostForm<{ images?: Record<string, { hash: string }> }>(`act_${adAccountId}/adimages`, accessToken, thumbForm);
        imageHash = thumbUpload.images?.["video_thumb.jpg"]?.hash || null;
      }
    }
  } catch {
    // handled by the null check below
  }
  if (!imageHash) {
    throw new Error("Couldn't generate a thumbnail for the video yet — Meta may still be processing it. Wait a moment and try launching again.");
  }

  return { isVideo: true, videoId, imageHash };
}

export async function resolvePageId(accessToken: string): Promise<string> {
  const configured = env.META_PAGE_ID;
  if (configured) return configured;
  const pages = await graphGet<{ data?: { id: string }[] }>("me/accounts", accessToken);
  if (!pages.data?.length) {
    throw new Error("No Facebook Page is linked to this access token. Meta requires a Page to create ad creatives — link one in Business Manager first.");
  }
  return pages.data[0].id;
}

export async function getOrCreatePixelId(accessToken: string, adAccountId: string): Promise<string> {
  const existing = await graphGet<{ data?: { id: string }[] }>(`act_${adAccountId}/adspixels`, accessToken);
  if (existing.data?.length) return existing.data[0].id;

  const created = await graphPost<{ id?: string }>(`act_${adAccountId}/adspixels`, accessToken, { name: "Kinetix Ads Pixel" });
  if (!created.id) {
    throw new Error(
      "This objective needs a tracking pixel and none could be found or created automatically. Create one in Meta Events Manager and assign it to this ad account, or switch the objective to Traffic, which doesn't require one."
    );
  }
  return created.id;
}

/** Turns our own TargetingInput fields into Meta's `targeting` object —
 * shared by every place that creates an Ad Set (Launch, and "+ Add Ad Set"
 * on an existing campaign). Cities/regions use Meta's own location "key"
 * (from /api/meta-ads/locations, not a plain name) — only countries can be
 * targeted by their ISO code directly. */
export function buildTargeting(input: TargetingInput) {
  const geo = input.geoLocations;
  const hasAny = !!(geo?.countries?.length || geo?.regions?.length || geo?.cities?.length);
  return {
    geo_locations: {
      ...(hasAny
        ? {
            ...(geo.countries.length ? { countries: geo.countries } : {}),
            ...(geo.regions.length ? { regions: geo.regions.map((key) => ({ key })) } : {}),
            ...(geo.cities.length ? { cities: geo.cities.map((key) => ({ key, radius: 25, distance_unit: "mile" })) } : {}),
          }
        : { countries: ["US"] }),
      location_types: ["home", "recent"],
    },
    age_min: input.ageMin || 18,
    age_max: input.ageMax || 65,
    ...(input.gender === 1 || input.gender === 2 ? { genders: [input.gender] } : {}),
    targeting_automation: { advantage_audience: input.advantageAudience ? 1 : 0 },
  };
}

/** Meta's real Lifetime Budget minimum: roughly $3 for a 1-day campaign,
 * +$1 for every additional day (i.e. `(days + 2) * 100` cents) — a Lifetime
 * budget always needs an end date so this can even be computed; Daily has
 * no such requirement. Ported from the legacy project's Campaign Setup
 * wizard, which enforced the identical rule client-side. */
export function minLifetimeBudgetCents(startAt: Date | undefined, endAt: Date | undefined): number | null {
  if (!endAt) return null;
  const start = startAt || new Date();
  const days = Math.max(1, Math.ceil((endAt.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
  return (days + 2) * 100;
}

/** Resolves which of daily_budget/lifetime_budget to send, and at which
 * level (Campaign if CBO, this Ad Set if not) — shared by Launch and
 * "+ Add Ad Set". Meta accepts exactly one budget field per object, never both. */
export function budgetField(input: BudgetInput): Record<string, number> {
  return input.budgetType === "lifetime"
    ? { lifetime_budget: input.lifetimeBudgetCents || 0 }
    : { daily_budget: input.dailyBudgetCents || 0 };
}

/** Turns our own placements fields into the Meta ad-set fields that control
 * where an ad shows. "advantage_plus" (the default) omits every placement
 * field entirely so Meta picks automatically — the legacy project collected
 * manual placement choices in its UI but never actually sent them to Meta;
 * this sends them for real when "manual" is chosen. */
export function buildPlacements(input: TargetingInput): Record<string, unknown> {
  if (input.placementsMode !== "manual") return {};
  const payload: Record<string, unknown> = {};
  if (input.publisherPlatforms?.length) payload.publisher_platforms = input.publisherPlatforms;
  if (input.publisherPlatforms?.includes("facebook") && input.facebookPositions?.length) {
    payload.facebook_positions = input.facebookPositions;
  }
  if (input.publisherPlatforms?.includes("instagram") && input.instagramPositions?.length) {
    payload.instagram_positions = input.instagramPositions;
  }
  return payload;
}

export interface DeliverySettings {
  optimizationGoal: string;
  promotedObject?: Record<string, unknown>;
  trackingSpecs?: unknown[];
  isPixelRequired: boolean;
}

/** Works out optimization goal + promoted object + tracking specs from the
 * objective, whether a native Lead Gen Form is attached, and (if needed) a
 * pixel — shared by Launch and "+ Add Ad Set". A user-chosen optimization
 * goal is respected unless a Lead Gen Form is attached (Meta requires
 * LEAD_GENERATION in that case) or the chosen goal is OFFSITE_CONVERSIONS
 * (which always needs a pixel, regardless of objective). */
export async function resolveDeliverySettings(
  objective: MetaObjective,
  leadGenFormId: string | null,
  userOptimizationGoal: string | undefined,
  pageId: string,
  getPixel: () => Promise<string>
): Promise<DeliverySettings> {
  const isLeadGenForm = objective === "OUTCOME_LEADS" && !!leadGenFormId;
  if (isLeadGenForm) {
    return { optimizationGoal: "LEAD_GENERATION", promotedObject: { page_id: pageId }, isPixelRequired: false };
  }

  const wantsConversions = userOptimizationGoal === "OFFSITE_CONVERSIONS" || (!userOptimizationGoal && objective === "OUTCOME_SALES");
  if (wantsConversions) {
    const pixelId = await getPixel();
    const customEvent = objective === "OUTCOME_SALES" ? "PURCHASE" : "LEAD";
    return {
      optimizationGoal: "OFFSITE_CONVERSIONS",
      promotedObject: { pixel_id: pixelId, custom_event_type: customEvent },
      trackingSpecs: [{ "action.type": ["offsite_conversion"], fb_pixel: [pixelId] }],
      isPixelRequired: true,
    };
  }

  return { optimizationGoal: userOptimizationGoal || "LINK_CLICKS", isPixelRequired: false };
}
