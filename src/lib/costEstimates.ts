/**
 * Shared cost-estimate model for the in-app Usage feature (Root Dashboard
 * card + Settings > Usage tab). Same per-unit rates and per-scene formulas
 * as the external Kinetix Cost Ledger reference doc — kept here as the one
 * place both UI surfaces read from, so the two never drift apart.
 *
 * These are MODELED estimates from each provider's published rate card and
 * the app's own real prompt sizes — not measured from actual
 * provider invoices (Kinetix doesn't log real per-call token/credit usage
 * today). Treat every number as directionally correct, not exact — see
 * `confidence` on each line: "reliable" inputs are small and mechanical
 * (a fixed prompt, one image render). Video generation (Seedance 2.5, content
 * automation) is not priced here.
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

/** AI-generated image — one OpenAI copy/prompt call + one Kie nano-banana-2 render. */
export const IMAGE_AD_COST_INR = 4.8;

export interface UsageCounts {
  imageAdCount: number;
}

export interface UsageEstimate {
  imageAd: CostRange;
  total: CostRange;
}

export interface TypicalUnitCosts {
  imageAd: CostRange;
}

/** Baseline per-unit rate, shown when nothing has been generated in the
 * selected month yet so "cost per unit" is never blank. */
export function typicalUnitCosts(): TypicalUnitCosts {
  return {
    imageAd: { minINR: IMAGE_AD_COST_INR, maxINR: IMAGE_AD_COST_INR, confidence: "reliable" },
  };
}

export function estimateUsageCost(counts: UsageCounts): UsageEstimate {
  const imageAd: CostRange = { minINR: round2(counts.imageAdCount * IMAGE_AD_COST_INR), maxINR: round2(counts.imageAdCount * IMAGE_AD_COST_INR), confidence: "reliable" };
  return { imageAd, total: sumRanges([imageAd]) };
}
