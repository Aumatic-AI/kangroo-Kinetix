// Live social publishing: which posts a finished creative gets (pure planner) and the
// frequency-aware same-platform spacing. Run: node --test scripts/tests/
import test from "node:test";
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
import assert from "node:assert/strict";
const { planAutomationPosts, RESCHEDULE_DELAY_MS } = await import("../../src/services/content-automation/schedule-posts.ts");
const { validateWeekPlan, minSamePlatformGapMs } = await import("../../src/services/content-automation/schedule.ts");

const NOW = Date.parse("2026-11-20T12:00:00Z");
const slot = (platform, iso) => ({ platform, scheduled_at: iso, timezone: "America/Toronto", local: "", reason: "", adjusted: false });
const content = (o = {}) => ({ pipeline: "social", contentType: "video", environment: "live", archived: false, generationStatus: "completed", currentRevisionId: "r1", ...o });
const revision = (o = {}) => ({
  id: "r1", validation: "valid", caption: "Base caption", hashtags: ["venue"],
  proposedSchedule: [slot("tiktok", "2026-11-24T01:00:00Z"), slot("instagram", "2026-11-23T00:00:00Z"), slot("facebook", "2026-11-25T17:30:00Z")],
  platformPosts: { instagram: { text: "IG text", hashtags: ["ig"] }, tiktok: { text: "TT text", hashtags: ["tt"] }, facebook: { text: "FB text", hashtags: [] } },
  ...o,
});
const conns = [
  { id: "c-tt", platform: "tiktok", status: "connected" }, { id: "c-ig", platform: "instagram", status: "connected" },
  { id: "c-fb-old", platform: "facebook", status: "revoked" }, { id: "c-fb", platform: "facebook", status: "connected" },
  { id: "c-li", platform: "linkedin", status: "connected" },
];
const plan = (o = {}) => planAutomationPosts({ content: content(), revision: revision(), connections: conns, existingPlatforms: [], live: true, now: NOW, ...o });

test("a Live social creative gets one scheduled post per platform at its AI time, with that platform's copy", () => {
  const p = plan();
  assert.equal(p.notEligible, null);
  assert.deepEqual(p.posts.map((x) => x.platform), ["tiktok", "instagram", "facebook"]);
  const ig = p.posts.find((x) => x.platform === "instagram");
  assert.equal(ig.scheduledAt, "2026-11-23T00:00:00.000Z");
  assert.equal(ig.timezone, "America/Toronto");
  assert.equal(ig.caption, "IG text");
  assert.deepEqual(ig.hashtags, ["ig"]);
  assert.equal(ig.format, "video");
  assert.equal(ig.status, "scheduled");
  assert.equal(p.posts.find((x) => x.platform === "facebook").connectionId, "c-fb", "prefers the connected account");
});

test("Testing, archived, unfinished or invalid content gets nothing", () => {
  assert.equal(plan({ content: content({ environment: "testing" }) }).notEligible, "not_live");
  assert.equal(plan({ content: content({ archived: true }) }).notEligible, "archived");
  assert.equal(plan({ content: content({ generationStatus: "processing" }) }).notEligible, "not_completed");
  assert.equal(plan({ revision: revision({ validation: "invalid" }) }).notEligible, "revision_not_valid");
  assert.equal(plan({ content: content({ currentRevisionId: "other" }) }).notEligible, "no_current_revision");
  assert.equal(plan({ content: content({ pipeline: "blog" }) }).notEligible, "pipeline_not_published_here");
  for (const o of [{ content: content({ environment: "testing" }) }, { content: content({ archived: true }) }]) assert.equal(plan(o).posts.length, 0);
});

test("LinkedIn creative → exactly one LinkedIn post (text + image)", () => {
  const p = plan({ content: content({ pipeline: "linkedin", contentType: "text_image" }),
    revision: revision({ proposedSchedule: [slot("linkedin", "2026-11-24T14:30:00Z")], platformPosts: { linkedin: { text: "LI text", hashtags: ["b2b"] } } }) });
  assert.deepEqual(p.posts.map((x) => [x.platform, x.format, x.connectionId, x.caption]), [["linkedin", "text_image", "c-li", "LI text"]]);
});

test("already-created platforms are left alone (idempotent); paused/Testing mode creates them held", () => {
  assert.deepEqual(plan({ existingPlatforms: ["tiktok", "facebook"] }).posts.map((x) => x.platform), ["instagram"]);
  assert.deepEqual(plan({ existingPlatforms: ["tiktok", "instagram", "facebook"] }).posts, []);
  assert.ok(plan({ live: false }).posts.every((x) => x.status === "held"));
});

test("missing connection or proposed time → not scheduled, with the reason", () => {
  const p = plan({ connections: conns.filter((c) => c.platform !== "tiktok"), revision: revision({ proposedSchedule: [slot("instagram", "2026-11-23T00:00:00Z"), slot("facebook", "2026-11-25T17:30:00Z")] }) });
  assert.deepEqual(p.skipped, [{ platform: "tiktok", reason: "no_proposed_time" }]);
  const q = plan({ connections: conns.filter((c) => c.platform !== "tiktok") });
  assert.deepEqual(q.skipped, [{ platform: "tiktok", reason: "no_connection" }]);
  // A disconnected-only account still gets a post (it fails visibly at publish and can be retried).
  const r = plan({ connections: [{ id: "c-fb-old", platform: "facebook", status: "revoked" }, ...conns.filter((c) => c.platform !== "facebook")] });
  assert.equal(r.posts.find((x) => x.platform === "facebook").connectionId, "c-fb-old");
});

test("a time that just passed is moved to shortly from now; one more than a day old is not posted", () => {
  const p = plan({ revision: revision({ proposedSchedule: [
    slot("tiktok", new Date(NOW - 2 * 3_600_000).toISOString()),
    slot("instagram", new Date(NOW + 60_000).toISOString()),
    slot("facebook", new Date(NOW - 30 * 3_600_000).toISOString()),
  ] }) });
  for (const pl of ["tiktok", "instagram"]) {
    const x = p.posts.find((y) => y.platform === pl);
    assert.equal(x.rescheduled, true, pl);
    assert.equal(Date.parse(x.scheduledAt), NOW + RESCHEDULE_DELAY_MS, pl);
  }
  assert.deepEqual(p.skipped, [{ platform: "facebook", reason: "proposed_time_passed" }]);
});

test("spacing: 20 h up to 7 posts a week; above 7, two a day but never colliding (up to 14)", () => {
  assert.equal(minSamePlatformGapMs(7), 20 * 3_600_000);
  assert.equal(minSamePlatformGapMs(8), 5 * 3_600_000);
  for (const count of [7, 8, 10, 14]) {
    const weekPlan = validateWeekPlan({ weekStart: "2026-11-23", timezone: "America/Toronto", platforms: ["tiktok", "instagram", "facebook"], count, raw: null });
    assert.equal(weekPlan.length, count);
    for (const platform of ["tiktok", "instagram", "facebook"]) {
      const times = weekPlan.map((p) => Date.parse(p.slots.find((s) => s.platform === platform).scheduled_at)).sort((a, b) => a - b);
      assert.equal(new Set(times).size, count, `${platform} ×${count}: distinct times`);
      for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= minSamePlatformGapMs(count), `${platform} ×${count}: gap`);
      const first = Date.parse("2026-11-23T05:00:00Z"), end = Date.parse("2026-11-30T05:00:00Z");
      assert.ok(times.every((t) => t >= first && t < end), `${platform} ×${count}: inside the week`);
    }
  }
});

test("blogs: a week of articles is planned on different weekdays (Tue/Thu first), inside posting hours", () => {
  const plan = validateWeekPlan({ weekStart: "2026-11-23", timezone: "America/Toronto", platforms: ["blog"], count: 3, raw: null });
  assert.equal(plan.length, 3);
  const locals = plan.map((p) => p.slots[0].local);
  assert.deepEqual(locals, ["2026-11-24 10:00", "2026-11-26 10:00", "2026-11-25 10:00"]);   // Tue, Thu, Wed
  assert.ok(plan.every((p) => p.slots.length === 1 && p.slots[0].platform === "blog" && p.slots[0].source === "week_plan"));
  // A good AI plan is kept as-is.
  const ai = { posts: [{ slot_index: 1, slots: [{ platform: "blog", date: "2026-11-25", time: "11:15", reason: "midweek readers" }] }] };
  const one = validateWeekPlan({ weekStart: "2026-11-23", timezone: "America/Toronto", platforms: ["blog"], count: 1, raw: ai });
  assert.equal(one[0].slots[0].local, "2026-11-25 11:15");
  assert.equal(one[0].slots[0].adjusted, false);
});

test("nextWeeklyRunMs: the coming Friday 18:00 Toronto (DST-aware), or next week's once it has passed", async () => {
  const { nextWeeklyRunMs } = await import("../../src/services/content-automation/schedule.ts");
  const iso = (s) => new Date(nextWeeklyRunMs(Date.parse(s))).toISOString();
  assert.equal(iso("2026-11-18T15:00:00Z"), "2026-11-20T23:00:00.000Z");   // Wed → Fri 18:00 EST
  assert.equal(iso("2026-11-20T22:59:00Z"), "2026-11-20T23:00:00.000Z");   // Fri 17:59 → same evening
  assert.equal(iso("2026-11-20T23:00:00Z"), "2026-11-27T23:00:00.000Z");   // Fri 18:00 exactly → next week
  assert.equal(iso("2027-07-14T12:00:00Z"), "2027-07-16T22:00:00.000Z");   // summer: Fri 18:00 EDT
});

test("Live 'Generate now' (current week): slots are never in the past, within the next 7 days", async () => {
  const { schedulingWindow, validateProposedSchedule } = await import("../../src/services/content-automation/schedule.ts");
  // Thursday 2026-11-19 15:00 Toronto; the current week started Monday 2026-11-16.
  const now = Date.parse("2026-11-19T20:00:00Z");
  const w = schedulingWindow("2026-11-16", now, "America/Toronto");
  assert.equal(w.start, "2026-11-19", "window starts today, not on the week's past Monday");
  assert.equal(w.notBeforeMs, now + 30 * 60_000);
  // The AI suggests a past day and an earlier hour today; both are replaced by future slots.
  const raw = { slots: [{ platform: "instagram", date: "2026-11-19", time: "09:00" }, { platform: "facebook", date: "2026-11-20", time: "12:30" }] };
  const slots = validateProposedSchedule({ weekStart: w.start, timezone: "America/Toronto", platforms: ["instagram", "facebook", "tiktok"], raw, taken: [], notBeforeMs: w.notBeforeMs });
  for (const s of slots) {
    assert.ok(Date.parse(s.scheduled_at) >= w.notBeforeMs, `${s.platform} ${s.local} is in the future`);
    assert.ok(Date.parse(s.scheduled_at) < now + 7 * 86_400_000, `${s.platform} within 7 days`);
  }
  assert.equal(slots.find((s) => s.platform === "instagram").adjusted, true, "09:00 today had passed");
  assert.equal(slots.find((s) => s.platform === "facebook").local, "2026-11-20 12:30", "a valid future AI slot is kept");
  // A week that hasn't started yet (Testing / the Friday run) is unchanged.
  assert.equal(schedulingWindow("2026-11-23", now, "America/Toronto").start, "2026-11-23");
});
