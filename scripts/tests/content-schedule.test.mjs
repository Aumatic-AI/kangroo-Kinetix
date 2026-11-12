// Pure-logic tests for scheduling + agent-output validation.
// Run: node --test scripts/tests/
import test from "node:test";
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
import assert from "node:assert/strict";
import { zonedLocalToUtcMs, validateProposedSchedule, addDays, mondayOf, isValidTimezone } from "../../src/services/content-automation/schedule.ts";
// Dynamic: agents.ts now has a relative import, and static imports hoist above register().
const { parseAgentJson, socialAgentSchema, linkedinAgentSchema, findUnsupportedClaims, validateRevisionContent } = await import("../../src/services/content-automation/agents.ts");
import { imagePost, videoPost, videoShot, linkedinPost, linkedinStrategy } from "./creative-fixtures.mjs";

test("zonedLocalToUtcMs: Toronto winter (EST, UTC-5) and summer (EDT, UTC-4)", () => {
  assert.equal(new Date(zonedLocalToUtcMs("2027-01-12", "09:30", "America/Toronto")).toISOString(), "2027-01-12T14:30:00.000Z");
  assert.equal(new Date(zonedLocalToUtcMs("2027-07-13", "09:30", "America/Toronto")).toISOString(), "2027-07-13T13:30:00.000Z");
});

test("zonedLocalToUtcMs: handles the DST boundary day (spring forward 2027-03-14)", () => {
  assert.equal(new Date(zonedLocalToUtcMs("2027-03-14", "08:00", "America/Toronto")).toISOString(), "2027-03-14T12:00:00.000Z");
  assert.equal(new Date(zonedLocalToUtcMs("2027-03-13", "08:00", "America/Toronto")).toISOString(), "2027-03-13T13:00:00.000Z");
});

test("date helpers", () => {
  assert.equal(addDays("2026-12-28", 7), "2027-01-04");
  assert.equal(mondayOf("2026-11-04"), "2026-11-02");
  assert.equal(mondayOf("2026-11-02"), "2026-11-02");
  assert.equal(mondayOf("2026-11-08"), "2026-11-02");
  assert.ok(isValidTimezone("America/Toronto")); assert.ok(!isValidTimezone("Mars/Base"));
});

const week = "2026-11-09";
const base = { weekStart: week, timezone: "America/Toronto", platforms: ["instagram", "facebook", "tiktok"], taken: [] };

test("validateProposedSchedule: keeps valid AI slots, one per platform, inside the week", () => {
  const out = validateProposedSchedule({ ...base, raw: { slots: [
    { platform: "instagram", date: "2026-11-10", time: "19:00", reason: "evening" },
    { platform: "facebook", date: "2026-11-12", time: "12:00", reason: "lunch" },
    { platform: "tiktok", date: "2026-11-14", time: "20:00", reason: "weekend" },
  ] } });
  assert.deepEqual(out.map((s) => s.platform), ["instagram", "facebook", "tiktok"]);
  assert.equal(out[0].scheduled_at, "2026-11-11T00:00:00.000Z");   // 19:00 EST = 00:00Z next day
  assert.ok(out.every((s) => !s.adjusted));
  assert.ok(out.every((s) => s.timezone === "America/Toronto"));
});

test("validateProposedSchedule: clamps off-hours and rejects dates outside the week", () => {
  const out = validateProposedSchedule({ ...base, platforms: ["instagram"], raw: { slots: [{ platform: "instagram", date: "2026-11-10", time: "03:00" }] } });
  assert.equal(out[0].local, "2026-11-10 08:00"); assert.ok(out[0].adjusted);
  const out2 = validateProposedSchedule({ ...base, platforms: ["instagram"], raw: { slots: [{ platform: "instagram", date: "2027-05-01", time: "19:00" }] } });
  assert.ok(out2[0].adjusted);
  const d = out2[0].local.split(" ")[0];
  assert.ok(d >= week && d <= addDays(week, 6), `fallback date ${d} must be inside the week`);
});

test("validateProposedSchedule: garbage / empty AI output still yields one valid slot per platform", () => {
  for (const raw of [null, undefined, "x", {}, { slots: "nope" }, { slots: [{}] }]) {
    const out = validateProposedSchedule({ ...base, raw });
    assert.equal(out.length, 3);
    assert.ok(out.every((s) => s.adjusted && !Number.isNaN(Date.parse(s.scheduled_at))));
  }
});

test("validateProposedSchedule: same platform is kept >=20h from existing slots", () => {
  const first = validateProposedSchedule({ ...base, platforms: ["instagram"], raw: { slots: [{ platform: "instagram", date: "2026-11-10", time: "19:00" }] } });
  const ms = Date.parse(first[0].scheduled_at);
  const second = validateProposedSchedule({ ...base, platforms: ["instagram"], taken: [{ platform: "instagram", ms }], raw: { slots: [{ platform: "instagram", date: "2026-11-10", time: "20:00" }] } });
  assert.ok(Math.abs(Date.parse(second[0].scheduled_at) - ms) >= 20 * 3_600_000);
  assert.ok(second[0].adjusted);
  // a different platform at the same time is fine
  const other = validateProposedSchedule({ ...base, platforms: ["facebook"], taken: [{ platform: "instagram", ms }], raw: { slots: [{ platform: "facebook", date: "2026-11-10", time: "19:00" }] } });
  assert.ok(!other[0].adjusted);
});

test("validateProposedSchedule: bad timezone falls back to America/Toronto", () => {
  const out = validateProposedSchedule({ ...base, timezone: "Nope/Zone", platforms: ["linkedin"], raw: null });
  assert.equal(out[0].timezone, "America/Toronto");
});

test("parseAgentJson strips code fences and surrounding prose", () => {
  assert.deepEqual(parseAgentJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseAgentJson('Here you go: {"a":{"b":2}} thanks'), { a: { b: 2 } });
  assert.throws(() => parseAgentJson("no json here"));
});

test("socialAgentSchema: accepts image and video plans, normalises hashtags and tags, and code builds the 30 s video prompt", () => {
  const img = socialAgentSchema.parse(imagePost);
  assert.deepEqual(img.hashtags, ["Venue", "torontoevents"]);
  assert.equal(img.strategy.awareness_level, "problem_aware");
  const v = socialAgentSchema.parse(videoPost(undefined, { people: "none" }));
  assert.equal(v.video.format, "single_clip");
  assert.deepEqual(v.video.clips.map((c) => c.duration_seconds), [30]);              // every video is ONE 30 s clip
  const prompt = v.video.clips[0].prompt;
  assert.ok(prompt.indexOf("CAMERA:") < prompt.indexOf("SUBJECT:"));                 // camera first
  assert.match(prompt, /0–3 s — camera: slow dolly in/);
  assert.match(prompt, /nobody speaks, sings, lip-syncs/);                           // background_guests rule (beat 3 has guests)
  assert.equal(v.people, "background_guests");                                       // derived from the shots, not the top-level field
  assert.match(prompt, /no text, captions, titles, logos/);
  assert.match(prompt, /ONE off-screen narrator/);
  assert.match(prompt, /narrator is the only voice/);
  assert.match(prompt, /Still squeezing birthdays into your living room\?/);
});

test("socialAgentSchema: a list-shaped script/concept is joined, not rejected (seen live: the agent sent script as beats)", () => {
  const v = socialAgentSchema.parse(videoPost(undefined, { script: ["0–3 s: cake lands", { beat: "3–15 s", action: "light slides" }], concept: ["a", "b"] }));
  assert.equal(v.script, "0–3 s: cake lands\n3–15 s — light slides");
  assert.equal(v.concept, "a\nb");
});

test("socialAgentSchema: common camera-move names map onto the allowed list; banned moves are still refused", () => {
  const withMove = (camera_move) => socialAgentSchema.safeParse(videoPost(videoShot({ beats: videoShot().beats.map((b, i) => (i === 1 ? { ...b, camera_move } : b)) })));
  for (const [m, want] of [["zoom in", "slow_zoom"], ["Push-in", "dolly_in"], ["tracking shot", "side_tracking"], ["tilt up", "tilt"]]) {
    const r = withMove(m); assert.ok(r.success, m); assert.equal(r.data.video.shot.beats[1].camera_move, want);
  }
  for (const m of ["orbit", "crane", "drone"]) assert.ok(!withMove(m).success, m);
});

test("socialAgentSchema: the narrator opens with its own spoken line — the caption hook is not repeated word for word (2026-11-12: \"POV:\" was said aloud)", () => {
  const spoken = videoShot().narration.replace("Still squeezing birthdays into your living room?", "So, where does the birthday go this year?");
  assert.ok(socialAgentSchema.safeParse(videoPost(videoShot({ narration: spoken }))).success);
});

test("socialAgentSchema: a generic hook is sent back before any media is made", () => {
  const generic = { ...imagePost.strategy, hook: { ...imagePost.strategy.hook, line: "Imagine a birthday party where every detail shines." } };
  const r = socialAgentSchema.safeParse({ ...imagePost, strategy: generic });
  assert.ok(!r.success); assert.match(JSON.stringify(r.error.issues), /must name at least one of your space_details/);
});

test("socialAgentSchema: a video's narration must be long enough and name at least 3 of the space details", () => {
  const ok = (narration) => socialAgentSchema.safeParse(videoPost(videoShot({ narration })));
  const generic = "Still squeezing birthdays into your living room? This is a beautiful and vibrant space with every detail perfect for your celebration. Imagine your friends gathered for a night to remember with music and joy and laughter all around. It is modern, stylish and elegant and ready for your party. Find it on Kangrooo and book your date today.";
  assert.ok(!ok(generic).success);                                                      // 60 words, names none of the details
  assert.match(JSON.stringify(ok(generic).error.issues), /name at least 3 of your space_details/);
  assert.ok(ok(videoShot().narration).success);
});

test("socialAgentSchema: rejects mismatches, missing strategy and invented claims before any media is made", () => {
  assert.ok(!socialAgentSchema.safeParse({ ...imagePost, image: null }).success);
  assert.ok(!socialAgentSchema.safeParse({ ...imagePost, content_type: "video" }).success);
  const { strategy, ...noStrategy } = imagePost;
  assert.ok(strategy && !socialAgentSchema.safeParse(noStrategy).success);
  assert.ok(!socialAgentSchema.safeParse({ ...imagePost, platform_captions: { tiktok: "Only 2 dates left — book now!" } }).success);   // urgency in a platform caption
  assert.ok(!socialAgentSchema.safeParse({ ...imagePost, caption: "I hosted my birthday here and loved it" }).success);                  // testimonial
});

test("socialAgentSchema: video beats must open with a ≤3 s hook and tile 0–30 s; risky moves are refused", () => {
  const shot = videoShot();
  const bad = (beats) => !socialAgentSchema.safeParse(videoPost({ ...shot, beats })).success;
  assert.ok(bad([{ ...shot.beats[0], end_s: 6 }, { ...shot.beats[1], start_s: 6 }, shot.beats[2]]));          // hook too long
  assert.ok(bad([shot.beats[0], { ...shot.beats[1], start_s: 5 }, shot.beats[2]]));                            // gap
  assert.ok(bad([shot.beats[0], shot.beats[1], { ...shot.beats[2], end_s: 20 }]));                              // stops early
  assert.ok(bad([shot.beats[0], shot.beats[1], { ...shot.beats[2], camera_move: "drone" }]));                    // not a safe move
  assert.ok(bad([shot.beats[0], shot.beats[1], { ...shot.beats[2], action: "the camera pulls back to reveal the whole building" }]));
  assert.ok(!socialAgentSchema.safeParse(videoPost(videoShot({ narration: "word ".repeat(80) }))).success);     // too long for 30 s
  assert.ok(!socialAgentSchema.safeParse(videoPost(videoShot({ narration: "My guests loved this place." }))).success);
});

test("socialAgentSchema: every video is a narrated promo — narration required, only the narrator speaks, the venue is the subject", () => {
  const ok = (over) => socialAgentSchema.safeParse(videoPost(videoShot(over)));
  for (const n of [null, "null", "None", "", "Short line only."]) assert.ok(!ok({ narration: n }).success, String(n));   // seen live: the STRING "null"
  const lived = videoShot().narration + " I hosted my birthday here and loved it.";
  assert.ok(!ok({ narration: lived }).success);                                                                       // testimonial
  assert.ok(!ok({ sound: "ambient chatter and light instrumental music" }).success);                                  // seen live: other voices
  const beats = videoShot().beats;
  // "chat"/"conversation" is silenced to mingling by code (seen live, it cost whole re-plans); real speech still fails
  const silenced = ok({ beats: [beats[0], { ...beats[1], action: "guests in animated conversation by the window", people: "background_guests" }, ...beats.slice(2)] });
  assert.ok(silenced.success); assert.equal(silenced.data.video.shot.beats[1].action, "guests mingling by the window");
  const quiet = ok({ beats: [beats[0], beats[1], { ...beats[2], action: "The room is filled with laughter and joy." }, ...beats.slice(3)] });   // seen live
  assert.ok(quiet.success); assert.equal(quiet.data.video.shot.beats[2].action, "The room is lively.");
  assert.ok(!ok({ beats: [beats[0], { ...beats[1], action: "zooming in on a small group of guests" }, ...beats.slice(2)] }).success);   // seen live
  assert.ok(!ok({ beats: [beats[0], beats[1], { ...beats[2], action: "a guest gives a toast to the room" }, ...beats.slice(3)] }).success);
  assert.ok(ok({}).success);
});

test("linkedinAgentSchema requires strategy, text + image prompt (no video field exists)", () => {
  const ok = linkedinAgentSchema.parse(linkedinPost());
  assert.ok(!("video" in ok));
  assert.ok(!linkedinAgentSchema.safeParse(linkedinPost({ post_text: "short" })).success);
  assert.ok(!linkedinAgentSchema.safeParse(linkedinPost({ strategy: { ...linkedinStrategy, framework: "cliffhanger" } })).success);   // social-only framework
  assert.ok(!linkedinAgentSchema.safeParse(linkedinPost({ post_text: "Not sponsored, just a great room for your next offsite." })).success);
});

test("findUnsupportedClaims flags invented prices, capacity, dimensions, superlatives", () => {
  for (const t of ["Only $99 an hour!", "50% off this week", "Fits up to 200 guests", "Capacity of 80", "2,500 sq ft of space", "an award-winning venue", "from 120 per night",
    "Last chance to book!", "Offer ends Sunday", "Selling fast", "#notanad", "Not sponsored, promise", "We hosted our team offsite here", "My guests loved it", "Best night of my life"])
    assert.ok(findUnsupportedClaims(t).length > 0, t);
  for (const t of ["A bright loft for your next workshop", "Host a birthday, a launch or a team offsite", "Find your space in Toronto", "Book a table for 4",
    "Have you ever hosted a party in a cramped living room?", "Find it on Kangrooo", "The ad-free way to plan: just book the room"])
    assert.deepEqual(findUnsupportedClaims(t), [], t);
});

test("validateRevisionContent: a video must be exactly one completed 30 s clip", () => {
  const ok = { contentType: "video", caption: "Nice space", hashtags: [], hasMedia: true, videoFormat: "single_clip", clipDurations: [30], completedClips: 1 };
  assert.ok(validateRevisionContent(ok).ok);
  assert.ok(!validateRevisionContent({ ...ok, completedClips: 0 }).ok);
  assert.ok(!validateRevisionContent({ ...ok, clipDurations: [20] }).ok);                 // not 30 s
  assert.ok(!validateRevisionContent({ ...ok, clipDurations: [15, 15], completedClips: 2 }).ok);   // two clips are no longer valid
  assert.ok(!validateRevisionContent({ ...ok, videoFormat: null }).ok);
  assert.ok(!validateRevisionContent({ ...ok, hasMedia: false }).ok);
  assert.ok(!validateRevisionContent({ ...ok, caption: "Only $5 per hour" }).ok);
  assert.ok(validateRevisionContent({ contentType: "image", caption: "Nice", hashtags: [], hasMedia: true }).ok);
  assert.ok(!validateRevisionContent({ contentType: "text_image", caption: "too short", hashtags: [], hasMedia: true }).ok);
});

// ---- week planning ----------------------------------------------------------
const { validateWeekPlan } = await import("../../src/services/content-automation/schedule.ts");
const SOCIAL = ["instagram", "facebook", "tiktok"];
const flat = (posts) => posts.flatMap((p) => p.slots);
const dayOf = (s) => s.local.split(" ")[0];

test("validateWeekPlan: plans every post of the frequency, one slot per platform, all tagged week_plan", () => {
  const plan = validateWeekPlan({ weekStart: week, timezone: "America/Toronto", platforms: SOCIAL, count: 3, raw: null });
  assert.deepEqual(plan.map((p) => p.slot_index), [1, 2, 3]);
  for (const p of plan) { assert.deepEqual(p.slots.map((s) => s.platform), SOCIAL); assert.ok(p.slots.every((s) => s.source === "week_plan")); }
  const inWeek = (d) => d >= week && d <= addDays(week, 6);
  assert.ok(flat(plan).every((s) => inWeek(dayOf(s))));
});

test("validateWeekPlan: deterministic fallback spreads posts over different days per platform (frequency 3 and 5)", () => {
  for (const count of [3, 5, 7]) {
    const plan = validateWeekPlan({ weekStart: week, timezone: "America/Toronto", platforms: SOCIAL, count, raw: null });
    for (const platform of SOCIAL) {
      const days = plan.map((p) => dayOf(p.slots.find((s) => s.platform === platform)));
      assert.equal(new Set(days).size, count, `${platform} x${count}: ${days.join(",")}`);
    }
  }
});

test("validateWeekPlan: same-platform spacing holds ACROSS posts, even when the AI piles them on one evening", () => {
  const pile = { posts: [1, 2, 3].map((i) => ({ slot_index: i, slots: SOCIAL.map((platform) => ({ platform, date: "2026-11-10", time: "19:00", reason: "x" })) })) };
  const plan = validateWeekPlan({ weekStart: week, timezone: "America/Toronto", platforms: SOCIAL, count: 3, raw: pile });
  for (const platform of SOCIAL) {
    const ms = plan.map((p) => Date.parse(p.slots.find((s) => s.platform === platform).scheduled_at)).sort((a, b) => a - b);
    for (let i = 1; i < ms.length; i++) assert.ok(ms[i] - ms[i - 1] >= 20 * 3_600_000, `${platform} posts too close`);
  }
  assert.ok(!plan[0].slots.some((s) => s.adjusted), "first post keeps the AI's slot");
  assert.ok(plan[1].slots.every((s) => s.adjusted) && plan[2].slots.every((s) => s.adjusted));
});

test("validateWeekPlan: keeps a good AI plan as-is and respects posting hours", () => {
  const good = { posts: [
    { slot_index: 1, slots: SOCIAL.map((platform) => ({ platform, date: "2026-11-09", time: "19:00" })) },
    { slot_index: 2, slots: SOCIAL.map((platform) => ({ platform, date: "2026-11-11", time: "12:30" })) },
    { slot_index: 3, slots: SOCIAL.map((platform) => ({ platform, date: "2026-11-14", time: "03:00" })) },
  ] };
  const plan = validateWeekPlan({ weekStart: week, timezone: "America/Toronto", platforms: SOCIAL, count: 3, raw: good });
  assert.deepEqual(plan.map((p) => dayOf(p.slots[0])), ["2026-11-09", "2026-11-11", "2026-11-14"]);
  assert.ok(plan[2].slots.every((s) => s.local.endsWith("08:00") && s.adjusted));   // 03:00 clamped
});

test("validateWeekPlan: only plans the missing posts and treats existing ones as taken", () => {
  const first = validateWeekPlan({ weekStart: week, timezone: "America/Toronto", platforms: ["linkedin"], count: 2, raw: null });
  const more = validateWeekPlan({ weekStart: week, timezone: "America/Toronto", platforms: ["linkedin"], count: 3, raw: null, existing: first });
  assert.deepEqual(more.map((p) => p.slot_index), [3]);
  const all = [...first, ...more].map((p) => Date.parse(p.slots[0].scheduled_at)).sort((a, b) => a - b);
  for (let i = 1; i < all.length; i++) assert.ok(all[i] - all[i - 1] >= 20 * 3_600_000);
  assert.deepEqual(validateWeekPlan({ weekStart: week, timezone: "America/Toronto", platforms: ["linkedin"], count: 2, raw: null, existing: first }), []);
});

test("validateWeekPlan: count 0 plans nothing; malformed AI shapes are ignored, not fatal", () => {
  assert.deepEqual(validateWeekPlan({ weekStart: week, timezone: "America/Toronto", platforms: SOCIAL, count: 0, raw: null }), []);
  for (const raw of [{ posts: "x" }, { posts: [null] }, { posts: [{ slot_index: 1, slots: "no" }] }, [], 5]) {
    const plan = validateWeekPlan({ weekStart: week, timezone: "America/Toronto", platforms: ["linkedin"], count: 2, raw });
    assert.equal(plan.length, 2);
  }
});
