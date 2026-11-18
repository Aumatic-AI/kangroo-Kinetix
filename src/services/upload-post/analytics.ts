import { uploadPostGet } from "./client";
import { UploadPostPlatform, UploadPostProfileAnalytics, UploadPostTotalImpressions, UploadPostCachedPostsResponse } from "./types";

/** Real, live account analytics per connected platform — followers, reach,
 * impressions, engagement, a 30-day reach time-series, and (Instagram only,
 * 100+ followers) audience demographics. Covers the whole account, not just
 * posts published through Upload-Post — see docs.upload-post.com/api/get-analytics. */
export async function getProfileAnalytics(username: string, platforms: UploadPostPlatform[]): Promise<Record<string, UploadPostProfileAnalytics>> {
  if (!platforms.length) return {};
  const data = (await uploadPostGet(`/analytics/${encodeURIComponent(username)}`, { platforms: platforms.join(",") })) || {};
  delete data.success;
  return data as Record<string, UploadPostProfileAnalytics>;
}

/** Total impressions across (optionally) all connected platforms over a
 * date range, with per-platform and per-day breakdowns — the source for a
 * real cross-platform impressions trend chart. Either a `period` preset
 * (last_day, last_week, last_month, last_3months, last_year — it overrides the
 * dates) or an exact `startDate`/`endDate` (YYYY-MM-DD). Note from Upload-Post's
 * docs: it sums daily snapshots, and Facebook's snapshot is a rolling 30-day
 * total, so Facebook is overstated over a range. */
export async function getTotalImpressions(
  username: string,
  opts: { period?: string; startDate?: string; endDate?: string; breakdown?: boolean } = {},
): Promise<UploadPostTotalImpressions> {
  const data = await uploadPostGet(`/uploadposts/total-impressions/${encodeURIComponent(username)}`, {
    period: opts.period,
    start_date: opts.period ? undefined : opts.startDate,
    end_date: opts.period ? undefined : opts.endDate,
    breakdown: opts.breakdown ? "true" : undefined,
  });
  return data as UploadPostTotalImpressions;
}

/** Recent posts across every connected platform — including ones posted
 * organically, never touched by Kinetix — each with real engagement
 * metrics. Uses the cached bulk endpoint (not rate-limited like the live
 * per-post lookup) since this reads many posts at once. */
export async function getCachedPostAnalytics(username: string, opts: { limit?: number; since?: string } = {}): Promise<UploadPostCachedPostsResponse> {
  const data = await uploadPostGet(`/uploadposts/post-analytics/cached`, {
    user: username,
    limit: opts.limit ? String(opts.limit) : undefined,
    since: opts.since,
  });
  return data as UploadPostCachedPostsResponse;
}
