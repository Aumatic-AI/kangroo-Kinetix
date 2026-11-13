import sharp from "sharp";
import { z } from "zod";

/**
 * Listing photos as AI reference images — the pure part (no network, no database).
 * The Inngest side lives in src/services/inngest/content/references.ts.
 *
 * Two problems, both reproduced on Kie on 2026-11-13 (see docs/architecture/content_automation.md §12):
 *
 * 1. FORMAT. 1,051 of the 1,538 imported photos are named `.avif` but contain JPEG bytes, and
 *    api.kangrooo.com serves them as `application/octet-stream`. Kie refuses every one of them
 *    ("File type not supported", code 500) for Seedance video AND nano-banana images, so 219
 *    listings could produce no media at all. Fix: every photo is re-encoded to a real JPEG and
 *    stored in our own bucket the first time a job needs it (free — no AI call), then reused.
 *
 * 2. COPYRIGHT. Seedance's output audit rejects a render that reproduces a prominent third-party
 *    character ("Content security audit did not pass; the output video may be related to copyright
 *    restrictions", failCode 400, 0 credits, but only after minutes of rendering). Aviva Studio's
 *    Hello Kitty balloon photo failed every time; an AI-cleaned copy passed. Smaller or painted
 *    characters (Simpsons arcade, Spider-Man art, a Grinch costume, a film on a screen) passed.
 *    Fix: reactive. Only after Kie rejects a render for copyright does the job screen that listing's
 *    photos, clean the risky ones (the only Kie spend), and retry; see chooseVideoReferences.
 */

// ---- format ------------------------------------------------------------------

export type SourceFormat = "jpeg" | "png" | "webp" | "avif" | "heif" | "gif" | "unknown";

/** The real format from the file's first bytes — the extension and Content-Type can't be trusted. */
export function sniffImageFormat(b: Buffer): SourceFormat {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length >= 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (b.length >= 6 && b.subarray(0, 6).toString("ascii").startsWith("GIF8")) return "gif";
  if (b.length >= 12 && b.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = b.subarray(8, 12).toString("ascii");
    if (brand === "avif" || brand === "avis") return "avif";
    if (/^(heic|heix|hevc|mif1|msf1)$/.test(brand)) return "heif";
  }
  return "unknown";
}

/** Longest side of a stored reference photo (Kie's own limits are far higher; this keeps uploads small). */
export const REFERENCE_MAX_SIDE = 2048;

/** Re-encodes any supported photo to a plain, upright, opaque JPEG that Kie accepts. */
export async function toReferenceJpeg(bytes: Buffer): Promise<{ buffer: Buffer; width: number; height: number; sourceFormat: SourceFormat }> {
  const sourceFormat = sniffImageFormat(bytes);
  if (sourceFormat === "unknown") throw new Error("not a recognised image file");
  const { data, info } = await sharp(bytes)
    .rotate()                                   // apply EXIF orientation
    .resize({ width: REFERENCE_MAX_SIDE, height: REFERENCE_MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })         // PNG/WebP transparency → white, JPEG has no alpha
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height, sourceFormat };
}

// ---- Kie failures ------------------------------------------------------------------

export type KieFailureKind = "copyright" | "unsupported_file" | "other";

/** What a Kie failure message means for the job (exact messages observed 2026-11-13). */
export function classifyKieFailure(message: string | null | undefined): KieFailureKind {
  const m = message ?? "";
  if (/copyright/i.test(m)) return "copyright";
  if (/file type not supported/i.test(m)) return "unsupported_file";
  return "other";
}

// ---- screening -------------------------------------------------------------------

const prominence = z.enum(["dominant", "clear", "small"]).catch("small");
export const referenceScreenSchema = z.object({
  characters: z.array(z.object({ name: z.string().catch("unknown"), form: z.string().catch("other"), prominence })).catch([]),
  brand_logos: z.array(z.object({ brand: z.string().catch("unknown"), prominence })).catch([]),
  watermark: z.string().nullable().catch(null),
  app_ui: z.string().nullable().catch(null),
  personal_text: z.string().nullable().catch(null),
  identifiable_people: z.enum(["none", "background", "prominent"]).catch("none"),
  screen_content: z.string().nullable().catch(null),
  artwork: z.string().nullable().catch(null),
});
export type ReferenceScreen = z.infer<typeof referenceScreenSchema>;

/** A verified, AI-cleaned copy of a listing photo (stored in our bucket). */
export interface CleanedReference { url: string; assetId: string; verified: boolean; remaining: string[] }

/** One listing photo as the pipeline uses it. `url` is always the normalized JPEG in our bucket. */
export interface PreparedReference {
  imageId: string;
  position: number;
  sourceUrl: string;
  url: string;
  assetId: string;
  width: number;
  height: number;
  /** Cached screening result — null until a copyright rejection made a job screen this photo. */
  screen: ReferenceScreen | null;
  clean: CleanedReference | null;
}

/**
 * How likely a photo is to make Seedance's copyright audit fail. Only a prominent character
 * failed in testing, so that's "high"; a small character, recognisable artwork or a film/image
 * on a screen passed but is the next suspect ("medium"). Watermarks, logos, app icons, names and
 * people did not trip the audit, so they don't count here.
 */
export function referenceRisk(screen: ReferenceScreen | null): "high" | "medium" | "low" {
  if (!screen) return "low";
  if (screen.characters.some((c) => c.prominence === "dominant" || c.prominence === "clear")) return "high";
  if (screen.characters.length || screen.artwork || screen.screen_content) return "medium";
  return "low";
}

/** What a screen found that could be third-party IP, as short labels (for logs and the gallery). */
export function riskLabels(screen: ReferenceScreen | null): string[] {
  if (!screen) return [];
  return [
    ...screen.characters.map((c) => `${c.name} (${c.form}, ${c.prominence})`),
    ...(screen.artwork ? [`artwork: ${screen.artwork}`] : []),
    ...(screen.screen_content ? [`screen: ${screen.screen_content}`] : []),
  ];
}

/**
 * Which photos to clean after a copyright rejection: the highest risk tier present (all "high"
 * photos, or — when there are none — all "medium" ones) that don't already have a cleaned copy.
 * Cleaning costs Kie credits, so low-risk photos are never sent.
 */
export function photosToClean(refs: PreparedReference[]): PreparedReference[] {
  const tier = refs.some((r) => referenceRisk(r.screen) === "high") ? "high" : refs.some((r) => referenceRisk(r.screen) === "medium") ? "medium" : null;
  if (!tier) return [];
  return refs.filter((r) => referenceRisk(r.screen) === tier && !r.clean);
}

/** The best known reference for a photo: its verified cleaned copy when one exists, else the normalized original. */
export function bestKnownUrl(r: PreparedReference): string {
  return r.clean?.verified ? r.clean.url : r.url;
}

/** Reference photos for image renders (no copyright audit on images, but never reuse a known-risky original). */
export function imageReferenceUrls(refs: PreparedReference[], max = 5): string[] {
  return refs.slice(0, max).map(bestKnownUrl);
}

export const VIDEO_REFERENCE_COUNT = 4;
/** Stages: 0 normal, 1 after screening + cleaning, 2 low-risk photos only. A rejection at stage 2 is final. */
export const MAX_REFERENCE_STAGE = 2;

/**
 * Reference photos for a Seedance render at each fallback stage (empty = nothing safe to send):
 * - 0: the first four photos, using any cleaned copy an earlier job already made.
 * - 1: (after this listing's photos were screened and the risky ones cleaned) low-risk originals
 *      plus verified cleaned copies; risky photos without a verified copy are dropped.
 * - 2: one photo only: the first low-risk original, else the first verified cleaned copy.
 */
export function chooseVideoReferences(refs: PreparedReference[], stage: number): string[] {
  if (stage <= 0) return refs.slice(0, VIDEO_REFERENCE_COUNT).map(bestKnownUrl);
  if (stage === 1) {
    return refs
      .map((r) => (referenceRisk(r.screen) === "low" ? r.url : r.clean?.verified ? r.clean.url : null))
      .filter((u): u is string => !!u)
      .slice(0, VIDEO_REFERENCE_COUNT);
  }
  const low = refs.find((r) => referenceRisk(r.screen) === "low");
  if (low) return [low.url];
  const cleaned = refs.find((r) => r.clean?.verified);
  return cleaned ? [cleaned.clean!.url] : [];
}

/** The image-model aspect ratio closest to a photo's own shape (for the cleaning edit). */
export function closestAspect(width: number, height: number): "9:16" | "4:5" | "16:9" | "1:1" {
  if (!(width > 0 && height > 0)) return "1:1";   // size unknown (an older cached asset): square is the safe default
  const r = width / height;
  const options = [["9:16", 9 / 16], ["4:5", 4 / 5], ["1:1", 1], ["16:9", 16 / 9]] as const;
  return options.reduce((best, o) => (Math.abs(Math.log(o[1] / r)) < Math.abs(Math.log(best[1] / r)) ? o : best))[0];
}
