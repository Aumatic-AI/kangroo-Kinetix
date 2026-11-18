// The Dashboard's "Needs attention" rules: every failure or stuck state becomes a visible item
// with its reason, errors first. Run: node --test scripts/tests/
import test from "node:test";
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
import assert from "node:assert/strict";
const { buildAttention } = await import("../../src/modules/dashboard/lib/attention.ts");

const NOW = Date.parse("2026-11-20T15:00:00Z");
const zero = { count: 0, latestError: null };
const connected = ["tiktok", "instagram", "facebook", "linkedin"].map((platform) => ({ platform, status: "connected", hasPage: true }));
const facts = (o = {}) => ({
  now: NOW, loadErrors: [],
  settings: { mode: "live", isEnabled: true, autoRunEnabled: true, blogFrequency: 2, totalFrequency: 8 },
  config: { uploadPostProfile: true, wordpress: true },
  connections: connected,
  automationPosts: { failed: zero, unconfirmed: 0, skippedRecently: zero, scheduled: [] },
  blogs: { failed: zero, skippedRecently: zero, overdue: 0 },
  generation: { failedRecently: zero, stalled: 0 },
  creativesMissingPosts: 0,
  manualPosts: { failed: zero, stuckPublishing: 0, unconfirmedScheduled: 0 },
  missedWeeklyRun: null,
  ...o,
});
const kinds = (f) => buildAttention(f).map((i) => i.kind);

test("all healthy → nothing to show", () => {
  assert.deepEqual(buildAttention(facts()), []);
});

test("the Dashboard's own load failures are shown, never swallowed", () => {
  const items = buildAttention(facts({ loadErrors: ["Couldn't load impressions from Upload-Post: 503"] }));
  assert.deepEqual(items.map((i) => [i.kind, i.severity, i.message]), [["load_error", "error", "Couldn't load impressions from Upload-Post: 503"]]);
});

test("failures carry their latest underlying error verbatim, and link to where to fix them", () => {
  const items = buildAttention(facts({
    automationPosts: { failed: { count: 2, latestError: "Instagram rejected: aspect ratio" }, unconfirmed: 1, skippedRecently: { count: 1, latestError: "missed the 06:00:00 publishing window: the listing was deactivated" }, scheduled: [] },
    blogs: { failed: { count: 1, latestError: "WordPress POST /posts failed (401)" }, skippedRecently: zero, overdue: 0 },
    generation: { failedRecently: { count: 3, latestError: "validation failed: unsupported claims" }, stalled: 0 },
    manualPosts: { failed: { count: 1, latestError: "Upload-Post didn't confirm" }, stuckPublishing: 0, unconfirmedScheduled: 0 },
  }));
  const by = Object.fromEntries(items.map((i) => [i.kind, i]));
  assert.equal(by.posts_failed.detail, "Instagram rejected: aspect ratio");
  assert.equal(by.posts_failed.href, "gallery");
  assert.match(by.posts_skipped.detail, /listing was deactivated/);
  assert.equal(by.blogs_failed.detail, "WordPress POST /posts failed (401)");
  assert.equal(by.generation_failed.detail, "validation failed: unsupported claims");
  assert.equal(by.manual_failed.href, "posts_failed", "opens the Posts page on its Failed tab");
  assert.equal(by.posts_unconfirmed.severity, "warning");
});

test("a scheduled post whose account isn't connected is flagged BEFORE it silently ages out", () => {
  const items = buildAttention(facts({ automationPosts: { failed: zero, unconfirmed: 0, skippedRecently: zero, scheduled: [
    { platform: "instagram", scheduledAt: "2026-11-21T00:00:00Z", connectionStatus: "revoked" },
    { platform: "tiktok", scheduledAt: "2026-11-21T01:00:00Z", connectionStatus: "connected" },
  ] } }));
  const blocked = items.find((i) => i.kind === "posts_blocked");
  assert.equal(blocked.count, 1);
  assert.equal(blocked.severity, "error");
  assert.match(blocked.message, /Instagram isn't connected/);
});

test("posts/blogs past their time with nothing blocking them → 'publisher may not be running'", () => {
  const items = buildAttention(facts({
    automationPosts: { failed: zero, unconfirmed: 0, skippedRecently: zero, scheduled: [
      { platform: "facebook", scheduledAt: new Date(NOW - 45 * 60_000).toISOString(), connectionStatus: "connected" },
      { platform: "facebook", scheduledAt: new Date(NOW - 10 * 60_000).toISOString(), connectionStatus: "connected" },   // within 30 min: fine
    ] },
    blogs: { failed: zero, skippedRecently: zero, overdue: 1 },
    generation: { failedRecently: zero, stalled: 2 },
  }));
  const by = Object.fromEntries(items.map((i) => [i.kind, i]));
  assert.equal(by.posts_overdue.count, 1);
  assert.match(by.posts_overdue.message, /publisher may not be running/);
  assert.equal(by.blogs_overdue.count, 1);
  assert.match(by.generation_stalled.message, /2 jobs/);
});

test("Live configuration and account problems; none of them in Testing", () => {
  const f = facts({
    config: { uploadPostProfile: false, wordpress: false },
    settings: { mode: "live", isEnabled: false, autoRunEnabled: true, blogFrequency: 1, totalFrequency: 4 },
    connections: [{ platform: "instagram", status: "connected", hasPage: false }, { platform: "facebook", status: "connected", hasPage: false }, { platform: "linkedin", status: "expired", hasPage: true }],
  });
  const k = kinds(f);
  for (const x of ["config_upload_post", "config_wordpress", "paused", "not_connected", "no_page"]) assert.ok(k.includes(x), x);
  const notConnected = buildAttention(f).find((i) => i.kind === "not_connected");
  assert.match(notConnected.message, /TikTok, LinkedIn aren't connected/);
  const noPage = buildAttention(f).find((i) => i.kind === "no_page");
  assert.match(noPage.message, /^Facebook has no page/, "Instagram never needs a page");
  // Testing mode: nothing publishes, so none of these are raised.
  assert.deepEqual(kinds({ ...f, settings: { ...f.settings, mode: "testing" } }), []);
  // WordPress only matters when blogs are being made.
  assert.ok(!kinds(facts({ config: { uploadPostProfile: true, wordpress: false }, settings: { mode: "live", isEnabled: true, autoRunEnabled: true, blogFrequency: 0, totalFrequency: 3 } })).includes("config_wordpress"));
});

test("a missed weekly run and stuck manual posts are errors; errors are listed before warnings", () => {
  const items = buildAttention(facts({
    missedWeeklyRun: "2026-11-13T23:00:00.000Z",
    manualPosts: { failed: { count: 1, latestError: "x" }, stuckPublishing: 1, unconfirmedScheduled: 2 },
    automationPosts: { failed: zero, unconfirmed: 1, skippedRecently: zero, scheduled: [] },
  }));
  assert.match(items.find((i) => i.kind === "weekly_run_missed").message, /Fri, Nov 13/);
  const sev = items.map((i) => i.severity);
  assert.deepEqual(sev, [...sev].sort((a, b) => (a === "error" ? 0 : 1) - (b === "error" ? 0 : 1)));
  assert.equal(items[0].severity, "error");
});
