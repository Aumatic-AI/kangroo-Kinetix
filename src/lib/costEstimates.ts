/**
 * Shared cost-estimate model for the in-app Usage feature (Root Dashboard
 * card + Settings > Usage tab). Same per-unit rates and per-scene formulas
 * as the external Kinetix Cost Ledger reference doc — kept here as the one
 * place both UI surfaces read from, so the two never drift apart.
 *
 * These are MODELED estimates from each provider's published rate card and
 * the app's own real prompt/scene sizes — not measured from actual
 * provider invoices (Kinetix doesn't log real per-call token/credit usage
 * today). Treat every number as directionally correct, not exact — see
 * `confidence` on each line: "reliable" inputs are small and mechanical
 * (a fixed prompt, a short narration line), "rough" is Kie's video-render
 * cost specifically, which real usage is more likely to exceed (Kie only
 * publishes 480p/720p tiers; Kinetix renders 1080x1920, above both, and
 * failed generations retry once, doubling that scene's real cost — neither
 * is counted here).
 */

export const USD_TO_INR = 95.5;

export type CostConfidence = "reliable" | "rough";

export interface CostRange {
  minINR: number;
  maxINR: number;
  confidence: CostConfidence;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Sums a list of ranges into one combined range. */
function sumRanges(ranges: CostRange[]): CostRange {
  const minINR = round2(ranges.reduce((s, r) => s + r.minINR, 0));
  const maxINR = round2(ranges.reduce((s, r) => s + r.maxINR, 0));
  const confidence: CostConfidence = ranges.some((r) => r.confidence === "rough") ? "rough" : "reliable";
  return { minINR, maxINR, confidence };
}

/** Image ad (Meta Ads' plain Create Ad flow, and Social's image post) —
 * one OpenAI copy/prompt call + one Kie nano-banana-2 render. */
export const IMAGE_AD_COST_INR = 4.8;

/** AI Ad Studio — a separate flow from the plain Image Ad above: one
 * one-time OpenAI call per session to ask clarifying questions, then every
 * generated image AND every chat-based edit is its own Kie call (the
 * studio prompt goes straight to the image model, no OpenAI pass). */
export const STUDIO_QUESTIONS_COST_INR = 1.22;
export const STUDIO_IMAGE_COST_INR = 3.82;

/** Outreach lead — Apify scrape + MillionVerifier check. Every row actually
 * saved to `outreach_leads` has already passed verification (unverified
 * scrapes are discarded, not stored), so one saved lead = one of each. */
export const OUTREACH_LEAD_COST: CostRange = { minINR: 0.19, maxINR: 0.29, confidence: "reliable" };

/** Video ad (Meta Ads + Social) — per real scene count, read from the
 * generated script's own line count (`ad_script.script.length` on Meta Ads
 * creatives, `metadata.script.length` on Social's `media_assets`). Split
 * into a reliable part (script + visual prompts + narration + one image
 * per scene) and the rough part (Kie's video-render cost per scene, the
 * one genuinely likely to run higher in practice). */
export function videoAdCost(sceneCount: number): CostRange {
  const reliable = 2.5 + 4.16 * sceneCount; // flat script + per-scene visual prompts + narration + image
  const clipMin = 3.82 * sceneCount;
  const clipMax = 6.69 * sceneCount;
  return { minINR: round2(reliable + clipMin), maxINR: round2(reliable + clipMax), confidence: "rough" };
}

export interface UsageCounts {
  imageAdCount: number;
  studioSessionCount: number;
  studioImageCount: number; // first image + every chat edit, combined
  outreachLeadCount: number;
  /** One entry per generated video, its real scene count. */
  videoSceneCounts: number[];
}

export interface UsageEstimate {
  imageAd: CostRange;
  studio: CostRange;
  video: CostRange;
  outreach: CostRange;
  total: CostRange;
}

/** Scene count used only to show a representative per-video rate when no
 * video has actually been generated in the selected month yet — matches
 * the app's own default-duration floor, the same fallback already used for
 * a script-less row in the usage API route. */
export const TYPICAL_VIDEO_SCENE_COUNT = 7;

export interface TypicalUnitCosts {
  imageAd: CostRange;
  studioImage: CostRange;
  video: CostRange;
  outreachLead: CostRange;
}

/** Baseline per-unit rate for each feature, independent of any real usage —
 * the fallback shown when a feature has 0 generations in the selected
 * month, so "cost per unit" is never blank just because nothing ran yet. */
export function typicalUnitCosts(): TypicalUnitCosts {
  return {
    imageAd: { minINR: IMAGE_AD_COST_INR, maxINR: IMAGE_AD_COST_INR, confidence: "reliable" },
    studioImage: { minINR: STUDIO_IMAGE_COST_INR, maxINR: STUDIO_IMAGE_COST_INR, confidence: "reliable" },
    video: videoAdCost(TYPICAL_VIDEO_SCENE_COUNT),
    outreachLead: OUTREACH_LEAD_COST,
  };
}

export function estimateUsageCost(counts: UsageCounts): UsageEstimate {
  const imageAd: CostRange = { minINR: round2(counts.imageAdCount * IMAGE_AD_COST_INR), maxINR: round2(counts.imageAdCount * IMAGE_AD_COST_INR), confidence: "reliable" };

  const studioTotal = round2(counts.studioSessionCount * STUDIO_QUESTIONS_COST_INR + counts.studioImageCount * STUDIO_IMAGE_COST_INR);
  const studio: CostRange = { minINR: studioTotal, maxINR: studioTotal, confidence: "reliable" };

  const video = sumRanges(counts.videoSceneCounts.map(videoAdCost));

  const outreach: CostRange = {
    minINR: round2(counts.outreachLeadCount * OUTREACH_LEAD_COST.minINR),
    maxINR: round2(counts.outreachLeadCount * OUTREACH_LEAD_COST.maxINR),
    confidence: "reliable",
  };

  const total = sumRanges([imageAd, studio, video, outreach]);

  return { imageAd, studio, video, outreach, total };
}
