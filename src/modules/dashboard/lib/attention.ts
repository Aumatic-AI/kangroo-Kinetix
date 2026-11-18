/**
 * Everything that has gone wrong (or is about to) anywhere in publishing, turned
 * into the Dashboard's "Needs attention" list. Pure — the API route gathers the
 * facts, this decides what to say — so the rules are unit-tested
 * (scripts/tests/dashboard-attention.test.mjs). Nothing that fails in the app
 * should be visible only in a log: if it needs a person, it belongs here.
 */

export type AttentionSeverity = "error" | "warning";
export type AttentionHref = "gallery" | "automation" | "accounts" | "posts" | "posts_failed" | "posts_scheduled";

export interface AttentionItem {
  kind: string;
  severity: AttentionSeverity;
  count: number;
  message: string;
  /** The most recent underlying error, verbatim, when there is one. */
  detail?: string;
  href?: AttentionHref;
}

/** A count plus the newest error text among those rows. */
export interface CountWithLatest { count: number; latestError: string | null }
const none: CountWithLatest = { count: 0, latestError: null };

export interface AttentionFacts {
  now: number;
  /** Failures loading the Dashboard's own data (Upload-Post, database). */
  loadErrors: string[];
  settings: {
    mode: "testing" | "live";
    isEnabled: boolean;
    autoRunEnabled: boolean;
    blogFrequency: number;
    totalFrequency: number;
  } | null;
  config: { uploadPostProfile: boolean; wordpress: boolean };
  /** Upload-Post connections for the platforms automation publishes to. */
  connections: { platform: string; status: string; hasPage: boolean }[];
  automationPosts: {
    failed: CountWithLatest;
    unconfirmed: number;
    skippedRecently: CountWithLatest;
    /** Every still-scheduled automation post: when, and its account's status. */
    scheduled: { platform: string; scheduledAt: string; connectionStatus: string | null }[];
  };
  blogs: { failed: CountWithLatest; skippedRecently: CountWithLatest; overdue: number };
  generation: { failedRecently: CountWithLatest; stalled: number };
  /** Live social/LinkedIn creatives (last 8 days) with a platform that has no post. */
  creativesMissingPosts: number;
  manualPosts: { failed: CountWithLatest; stuckPublishing: number; unconfirmedScheduled: number };
  /** The last weekly run that should have created a cycle and didn't (ISO), if any. */
  missedWeeklyRun: string | null;
}

/** A scheduled post more than this late (with a healthy account) means the publisher isn't running. */
export const OVERDUE_MS = 30 * 60_000;

const AUTOMATION_PLATFORMS = ["tiktok", "instagram", "facebook", "linkedin"];
const LABEL: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn" };
const label = (p: string) => LABEL[p] ?? p;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listOf = (xs: string[]) => [...new Set(xs)].map(label).join(", ");

export function buildAttention(f: AttentionFacts): AttentionItem[] {
  const items: AttentionItem[] = [];
  const push = (item: AttentionItem) => { if (item.count > 0) items.push(item); };
  const live = f.settings?.mode === "live";

  // ---- the Dashboard itself ----------------------------------------------------
  for (const e of f.loadErrors) push({ kind: "load_error", severity: "error", count: 1, message: e });

  // ---- configuration and accounts (only matter once something would publish) ----
  if (live) {
    if (!f.config.uploadPostProfile) {
      push({ kind: "config_upload_post", severity: "error", count: 1, message: "Upload-Post isn't configured (UPLOAD_POST_PROFILE), so no social or LinkedIn post can be published" });
    }
    if (!f.config.wordpress && (f.settings?.blogFrequency ?? 0) > 0) {
      push({ kind: "config_wordpress", severity: "error", count: 1, message: "WordPress isn't configured (WORDPRESS_URL / WORDPRESS_USERNAME / WORDPRESS_APP_PASSWORD), so blogs can't be published" });
    }
    if (f.settings && !f.settings.isEnabled) {
      push({ kind: "paused", severity: "warning", count: 1, message: "Live, but automation is paused — nothing is generated or published until you resume", href: "automation" });
    }
    const byPlatform = new Map(f.connections.map((c) => [c.platform, c]));
    const notConnected = AUTOMATION_PLATFORMS.filter((p) => byPlatform.get(p)?.status !== "connected");
    push({ kind: "not_connected", severity: "error", count: notConnected.length,
      message: `${listOf(notConnected)} ${notConnected.length === 1 ? "isn't" : "aren't"} connected — automation posts for ${notConnected.length === 1 ? "it" : "them"} won't go out`, href: "accounts" });
    const noPage = ["facebook", "linkedin"].filter((p) => byPlatform.get(p)?.status === "connected" && !byPlatform.get(p)?.hasPage);
    push({ kind: "no_page", severity: "error", count: noPage.length,
      message: `${listOf(noPage)} has no page selected — those posts are refused until you sync Connected Accounts`, href: "accounts" });
  }

  // ---- automation posts --------------------------------------------------------
  const blocked = f.automationPosts.scheduled.filter((p) => p.connectionStatus !== "connected");
  push({ kind: "posts_blocked", severity: "error", count: blocked.length,
    message: `${plural(blocked.length, "scheduled post")} can't publish because ${listOf(blocked.map((p) => p.platform))} isn't connected — reconnect before ${blocked.length === 1 ? "its" : "their"} time, or ${blocked.length === 1 ? "it's" : "they're"} skipped 6 hours after it`,
    href: "accounts" });
  const overdue = f.automationPosts.scheduled.filter((p) => p.connectionStatus === "connected" && Date.parse(p.scheduledAt) < f.now - OVERDUE_MS);
  push({ kind: "posts_overdue", severity: "error", count: overdue.length,
    message: `${plural(overdue.length, "post")} ${overdue.length === 1 ? "is" : "are"} more than 30 minutes past ${overdue.length === 1 ? "its" : "their"} time and still waiting — the publisher may not be running (check Inngest)`,
    href: "gallery" });
  push({ kind: "posts_failed", severity: "error", count: f.automationPosts.failed.count,
    message: `${plural(f.automationPosts.failed.count, "automation post")} failed to publish`, detail: f.automationPosts.failed.latestError ?? undefined, href: "gallery" });
  push({ kind: "posts_unconfirmed", severity: "warning", count: f.automationPosts.unconfirmed,
    message: `${plural(f.automationPosts.unconfirmed, "post")} may or may not have gone out — check the account and confirm in the gallery`, href: "gallery" });
  push({ kind: "posts_skipped", severity: "warning", count: f.automationPosts.skippedRecently.count,
    message: `${plural(f.automationPosts.skippedRecently.count, "automation post")} ${f.automationPosts.skippedRecently.count === 1 ? "was" : "were"} skipped in the last 7 days`,
    detail: f.automationPosts.skippedRecently.latestError ?? undefined, href: "gallery" });
  push({ kind: "creatives_unscheduled", severity: "warning", count: f.creativesMissingPosts,
    message: `${plural(f.creativesMissingPosts, "Live creative")} ${f.creativesMissingPosts === 1 ? "has a platform" : "have platforms"} with no post (no connected account, or the proposed time had passed)`,
    href: "gallery" });

  // ---- blogs -------------------------------------------------------------------
  push({ kind: "blogs_failed", severity: "error", count: f.blogs.failed.count,
    message: `${plural(f.blogs.failed.count, "blog")} failed to publish to WordPress`, detail: f.blogs.failed.latestError ?? undefined, href: "gallery" });
  push({ kind: "blogs_overdue", severity: "error", count: f.blogs.overdue,
    message: `${plural(f.blogs.overdue, "blog")} ${f.blogs.overdue === 1 ? "is" : "are"} more than 30 minutes past ${f.blogs.overdue === 1 ? "its" : "their"} publish time and still waiting — the publisher may not be running (check Inngest)`,
    href: "gallery" });
  push({ kind: "blogs_skipped", severity: "warning", count: f.blogs.skippedRecently.count,
    message: `${plural(f.blogs.skippedRecently.count, "blog")} ${f.blogs.skippedRecently.count === 1 ? "was" : "were"} skipped in the last 7 days`,
    detail: f.blogs.skippedRecently.latestError ?? undefined, href: "gallery" });

  // ---- generation --------------------------------------------------------------
  push({ kind: "generation_stalled", severity: "error", count: f.generation.stalled,
    message: `Generation has stalled: ${plural(f.generation.stalled, "job")} waiting over an hour — check Inngest`, href: "gallery" });
  if (f.missedWeeklyRun) {
    push({ kind: "weekly_run_missed", severity: "error", count: 1,
      message: `The weekly run due ${new Date(f.missedWeeklyRun).toLocaleString("en-CA", { timeZone: "America/Toronto", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} didn't create next week's content — check Inngest`,
      href: "automation" });
  }
  push({ kind: "generation_failed", severity: "warning", count: f.generation.failedRecently.count,
    message: `${plural(f.generation.failedRecently.count, "creative")} failed to generate in the last 7 days`,
    detail: f.generation.failedRecently.latestError ?? undefined, href: "gallery" });

  // ---- manual Social posts -----------------------------------------------------
  push({ kind: "manual_stuck", severity: "error", count: f.manualPosts.stuckPublishing,
    message: `${plural(f.manualPosts.stuckPublishing, "Social post")} ${f.manualPosts.stuckPublishing === 1 ? "has" : "have"} been publishing for over 15 minutes with no result — check the account`,
    href: "posts" });
  push({ kind: "manual_failed", severity: "warning", count: f.manualPosts.failed.count,
    message: `${plural(f.manualPosts.failed.count, "Social post")} failed`, detail: f.manualPosts.failed.latestError ?? undefined, href: "posts_failed" });
  push({ kind: "manual_unconfirmed", severity: "warning", count: f.manualPosts.unconfirmedScheduled,
    message: `${plural(f.manualPosts.unconfirmedScheduled, "scheduled Social post")} ${f.manualPosts.unconfirmedScheduled === 1 ? "wasn't" : "weren't"} confirmed after ${f.manualPosts.unconfirmedScheduled === 1 ? "its" : "their"} time — check the account`,
    href: "posts_scheduled" });

  // Errors first, keeping the order above within each severity.
  return [...items.filter((i) => i.severity === "error"), ...items.filter((i) => i.severity === "warning")];
}

export { none as NO_ROWS };
