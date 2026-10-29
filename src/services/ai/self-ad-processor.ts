/**
 * Self-Ad Performance Scoring
 *
 * Ports the deterministic scoring formula and pattern-based diagnosis
 * from the legacy project's /api/meta/report-analysis route — the one
 * part of the old system that was never n8n, and is considerably more
 * sophisticated than a simple ROAS threshold. Aggregates daily
 * snapshot rows per ad first (fixing a real bug: the previous version
 * bucketed individual daily rows instead of whole ads, so a 30-day-old
 * ad counted as ~23 separate "seasoned" entries).
 *
 * Used by the Meta Ads Dashboard's self-ad score distribution chart only
 * (`/api/meta-ads/dashboard`) — computed fresh from `ad_performance_daily`
 * on every load. The weekly AI self-ad-analysis report that used to also
 * read this (bucketing into top/under-performers for an LLM writeup, with
 * a rule-based fallback) was removed as an unused feature, along with its
 * cron job — this file now only exports the scoring/diagnosis primitives
 * the Dashboard chart actually needs.
 */

export interface DailyRow {
  meta_ad_id: string;
  metric_date: string;
  spend_cents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number | null;
  cpc_cents: number | null;
  cpm_cents: number | null;
  ad_text: string | null;
  media_url: string | null;
  format: string | null;
}

export interface AggregatedAd {
  metaAdId: string;
  adText: string | null;
  mediaUrl: string | null;
  format: string | null;
  firstSeen: string;
  lastSeen: string;
  daysRunning: number;
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpcCents: number;
  cpmCents: number;
  score: number;
  scoreLabel: "Excellent" | "Good" | "Average" | "Needs Work" | "Critical";
  pattern: "A" | "B" | "C" | "D" | "E" | null;
}

/** Aggregates raw daily snapshot rows into one record per ad, with its
 * true lifetime span — this is what "running for 7+ days" should mean,
 * not "this daily row happens to be old." */
export function aggregateByAd(rows: DailyRow[]): AggregatedAd[] {
  const byAd = new Map<string, DailyRow[]>();
  for (const row of rows) {
    if (!byAd.has(row.meta_ad_id)) byAd.set(row.meta_ad_id, []);
    byAd.get(row.meta_ad_id)!.push(row);
  }

  const now = Date.now();

  return Array.from(byAd.entries()).map(([metaAdId, adRows]) => {
    const sorted = [...adRows].sort((a, b) => a.metric_date.localeCompare(b.metric_date));
    const firstSeen = sorted[0].metric_date;
    const lastSeen = sorted[sorted.length - 1].metric_date;
    const latest = sorted[sorted.length - 1];

    const spendCents = adRows.reduce((s, r) => s + (r.spend_cents || 0), 0);
    const impressions = adRows.reduce((s, r) => s + (r.impressions || 0), 0);
    const clicks = adRows.reduce((s, r) => s + (r.clicks || 0), 0);
    const conversions = adRows.reduce((s, r) => s + (r.conversions || 0), 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpcCents = clicks > 0 ? Math.round(spendCents / clicks) : 0;
    const cpmCents = impressions > 0 ? Math.round((spendCents / impressions) * 1000) : 0;
    const daysRunning = Math.floor((now - new Date(firstSeen).getTime()) / 86_400_000);

    const score = computeScore(spendCents / 100, impressions, clicks, ctr, cpmCents / 100);

    return {
      metaAdId,
      adText: latest.ad_text,
      mediaUrl: latest.media_url,
      format: latest.format,
      firstSeen,
      lastSeen,
      daysRunning,
      spendCents,
      impressions,
      clicks,
      conversions,
      ctr,
      cpcCents,
      cpmCents,
      score,
      scoreLabel: scoreLabel(score),
      pattern: null, // filled in by diagnosePattern once the account average CPC is known
    };
  });
}

/** Same CTR-curve scoring formula as the legacy report-analysis route —
 * proven for this account, and works for any CTR-driven ad platform,
 * not just one vertical. */
function computeScore(spend: number, impressions: number, clicks: number, ctr: number, cpm: number): number {
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

function scoreLabel(score: number): AggregatedAd["scoreLabel"] {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Average";
  if (score >= 20) return "Needs Work";
  return "Critical";
}

/** Root-cause pattern, same five buckets as the legacy diagnosis:
 * A = never delivered, B = seen but nobody clicks, C = clicks but weak CTR,
 * D = good CTR but starved for reach, E = fine CTR but expensive clicks. */
export function diagnosePattern(ad: AggregatedAd, accountAvgCpcCents: number): AggregatedAd["pattern"] {
  const noDelivery = ad.impressions === 0 && ad.spendCents === 0;
  if (noDelivery) return "A";
  const zeroClick = ad.ctr === 0 && ad.spendCents > 0 && ad.impressions > 0;
  if (zeroClick) return "B";
  if (ad.ctr > 0 && ad.ctr < 0.3) return "C";
  if (ad.ctr > 0.5 && ad.impressions < 500) return "D";
  if (ad.ctr >= 0.3 && accountAvgCpcCents > 0 && ad.cpcCents > accountAvgCpcCents * 1.3) return "E";
  return null;
}

