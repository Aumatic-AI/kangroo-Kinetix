/**
 * Temporary feature switches. Flip to `true` to bring a hidden module back —
 * nothing was deleted, only hidden from nav, page routes, and the root dashboard.
 */
export const FEATURES = {
  /** Meta Ads module: sidebar entry, /meta-ads/* pages, and Meta data on the root dashboard. */
  metaAds: false,
} as const;
