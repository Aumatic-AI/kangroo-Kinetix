/**
 * Which sidebar item is "current" for a pathname. The most specific match wins:
 * an item matches when the path equals its href or sits underneath it, and the
 * longest matching href is the active one. That keeps `/social` (analytics)
 * apart from `/social/posts`, and `/content` apart from `/content/automation`,
 * while detail routes beneath a page keep that page highlighted.
 */
export function findActiveHref(pathname: string, hrefs: readonly string[]): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  let best: string | null = null;
  for (const href of hrefs) {
    if (path === href || path.startsWith(href + "/")) {
      if (best === null || href.length > best.length) best = href;
    }
  }
  return best;
}
