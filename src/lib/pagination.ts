/** The two allowed page sizes across the app — never a bespoke number.
 * COMPACT for tables/low-density grids (roughly ≤10 rows visible per
 * viewport without scrolling); DENSE for denser card/thumbnail grids
 * (roughly >10 tiles visible per viewport). Pick per-page, not per-item. */
export const PAGE_SIZE_COMPACT = 10;
export const PAGE_SIZE_DENSE = 20;

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Builds the metadata block every paginated API response returns
 * alongside its data array. `totalPages` is always at least 1 so an empty
 * result doesn't render as "page 1 of 0". */
export function paginationMeta(total: number, page: number, limit: number): PaginationMeta {
  return { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/** The `.range(from, to)` bounds Supabase's query builder expects, for a
 * 1-indexed page + limit. */
export function rangeFor(page: number, limit: number): [number, number] {
  const from = (page - 1) * limit;
  return [from, from + limit - 1];
}

/** In-memory pagination for lists that can't be paginated at the query
 * level (e.g. Social Posts, whose rows are grouped client-side after
 * fetching — see src/modules/social/lib/postGroups.ts). */
export function paginateArray<T>(items: T[], page: number, limit: number): T[] {
  const [from, to] = rangeFor(page, limit);
  return items.slice(from, to + 1);
}
