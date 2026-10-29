/**
 * Deterministic ad performance score — ported as-is from the legacy
 * project's /api/meta/report-analysis route. CTR is the dominant factor
 * (it's the single biggest lever in Meta's auction — see the Reports tab's
 * "Why this score" explainer), with small bonuses for click volume and an
 * efficient CPM. The same ad always gets the same score for the same
 * inputs, regardless of when you ask or what date range you're comparing
 * against — GPT is only ever used to *explain* this score, never to set it.
 */
export function computeAdScore(spend: number, impressions: number, clicks: number, ctr: number, cpm: number): number {
  if (impressions === 0 && spend === 0) return 5;
  if (clicks === 0) return impressions > 200 ? 12 : 8;

  let ctrScore: number;
  if (ctr < 0.1) ctrScore = 15 + (ctr / 0.1) * 10;
  else if (ctr < 0.3) ctrScore = 25 + ((ctr - 0.1) / 0.2) * 20;
  else if (ctr < 0.7) ctrScore = 45 + ((ctr - 0.3) / 0.4) * 20;
  else if (ctr < 1.5) ctrScore = 65 + ((ctr - 0.7) / 0.8) * 15;
  else ctrScore = 80 + Math.min(((ctr - 1.5) / 1.5) * 15, 15);

  const clickBonus = Math.min(clicks * 0.5, 10);
  const cpmBonus = cpm > 0 && cpm < 2 ? 5 : cpm >= 2 && cpm < 5 ? 3 : cpm > 12 ? -3 : 0;
  return Math.max(5, Math.min(100, Math.round(ctrScore + clickBonus + cpmBonus)));
}

export function scoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Average";
  if (score >= 20) return "Needs Work";
  return "Critical";
}

export const SCORE_METHODOLOGY = "80-100 Excellent · 60-79 Good · 40-59 Average · 20-39 Needs Work · 5-19 Critical";
