// Creative-strategy layer: persona hints, hook-repeat detection, camera safety, prompt assembly, truth rules.
// Run: node --test scripts/tests/content-strategy.test.mjs
import test from "node:test";
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
import assert from "node:assert/strict";
const {
  personaOptions, hookSimilarity, findRepeatedHook, findRiskyCameraLanguage, buildVideoPrompt, peopleRule, shotPeople, namedDetails, spaceDetailsSchema, hookProblems,
  socialStrategySchema, videoShotSchema,
} = await import("../../src/services/content-automation/strategy.ts");
const { getSocialAgentPrompt, getLinkedInAgentPrompt } = await import("../../src/prompts/content-automation/index.ts");
import { socialStrategy, videoShot, spaceDetails, shotLines } from "./creative-fixtures.mjs";

test("personaOptions maps the real inventory's event types to a persona and one desire", () => {
  const opts = personaOptions(["Birthday Parties", "Corporate Meetings", "Podcast Recording", "Something Unknown"]);
  assert.deepEqual(opts.map((o) => o.eventType), ["Birthday Parties", "Corporate Meetings", "Podcast Recording"]);
  assert.equal(opts[0].desire, "belonging");
  assert.equal(opts[1].desire, "control");
  // "Business Workshops" is a meeting-style event, "Creative Workshops" a facilitator one
  assert.match(personaOptions(["Business Workshops"])[0].persona, /credible/);
  assert.match(personaOptions(["Creative Workshops"])[0].persona, /facilitator/);
});

test("findRepeatedHook catches near-duplicates, not merely related hooks", () => {
  const recent = ["Still squeezing birthdays into your living room?", "3 signs your meeting room is draining your team"];
  assert.equal(findRepeatedHook("Still squeezing your birthdays into the living room?", recent), recent[0]);
  assert.equal(findRepeatedHook("POV: the workshop finally has room to think", recent), null);
  assert.equal(hookSimilarity("same line", "same line"), 1);
  assert.equal(findRepeatedHook("anything", []), null);
});

test("findRiskyCameraLanguage flags reveals beyond the photographed space", () => {
  for (const t of ["drone shot over the roof", "camera pulls back to reveal the building", "full orbit around the room", "FPV fly-through of the hallway", "a quick whip pan to the bar"])
    assert.ok(findRiskyCameraLanguage(t).length > 0, t);
  for (const t of ["slow dolly in toward the table", "slider with foreground parallax", "locked frame, hold"])
    assert.deepEqual(findRiskyCameraLanguage(t), [], t);
});

test("buildVideoPrompt: camera first, beats in time order, people rule, text-free, the narrator is the only voice", () => {
  const clean = videoShot().beats.map((b) => ({ ...b, people: "none", action: b.action.replace("background guests gather and raise glasses", "late light settles on the set table") }));
  const shot = videoShotSchema.parse(videoShot({ beats: [...clean].reverse() }));
  const p = buildVideoPrompt(shot);
  assert.ok(p.indexOf("0–3 s") < p.indexOf("3–9 s") && p.indexOf("3–9 s") < p.indexOf("26–30 s"));
  assert.match(p, /People: no people in the scene/);
  assert.match(p, /ONE off-screen narrator/); assert.match(p, /The narrator is the only voice — nobody on screen speaks, and there is no other speech, singing or crowd sound/);
  assert.match(p, /no slow motion/);
  assert.match(peopleRule("background_guests"), /the venue is the subject/); assert.match(peopleRule("background_guests"), /never in close-up/);
});

test("people are decided per shot: clean shots, the space in use, or a mix — the overall setting follows the shots", () => {
  const base = videoShot().beats;
  const mixed = videoShotSchema.parse(videoShot());
  assert.equal(shotPeople(mixed), "background_guests");
  const p = buildVideoPrompt(mixed);
  assert.match(p, /0–3 s .*People: none — a clean shot of the empty space/);
  assert.match(p, /9–15 s .*People: a few background guests, small in frame/);
  assert.match(p, /Shots marked "People: none" show the space with nobody in it/);
  const clean = videoShotSchema.parse(videoShot({ beats: base.map((b) => ({ ...b, people: "none", action: "light moves slowly across the empty room" })) }));
  assert.equal(shotPeople(clean), "none"); assert.match(buildVideoPrompt(clean), /People: no people in the scene/);
  // a clean shot whose action mentions people is a contradiction → sent back to the agent
  assert.ok(!videoShotSchema.safeParse(videoShot({ beats: [base[0], { ...base[1], action: "guests walk past the window", people: "none" }, ...base.slice(2)] })).success);
});

test("space details: concrete only, and the narration must name them (seen live: 38 generic words)", () => {
  const aviva = ["LED-screen stage with purple lighting", "white blossom-tree centrepieces", "gold chiavari chairs", "navy blue walls"];
  assert.ok(spaceDetailsSchema.safeParse(aviva).success);
  assert.ok(!spaceDetailsSchema.safeParse(["elegant decor", "vibrant atmosphere", "gold chairs", "navy walls"]).success);   // vague items
  assert.ok(!spaceDetailsSchema.safeParse(["gold chairs", "navy walls"]).success);                                          // too few
  const generic = "Imagine a birthday party where every detail is perfect. Aviva Studio in Oakville offers a vibrant space for unforgettable celebrations. From elegant table settings to a lively stage, it's all here. Book your next birthday party on Kangrooo.";
  assert.deepEqual(namedDetails(generic, aviva), ["LED-screen stage with purple lighting"]);                                // "stage" only → 1 of 4
  const concrete = "Under the purple lights, the LED screen sets the stage, white blossom trees crown every table and gold chiavari chairs line the navy walls.";
  assert.equal(namedDetails(concrete, aviva).length, 4);
});

test("narration written per shot, voiced as ONE continuous take: parts joined in shot order, capped per shot, not pinned to timestamps", () => {
  const lines = shotLines;
  const base = videoShot({ narration: undefined });
  const beats = base.beats.map((b, i) => ({ ...b, line: lines[i] }));
  const shot = videoShotSchema.parse({ ...base, beats: [...beats].reverse() });
  assert.equal(shot.narration, lines.join(" "));                                                                // joined in time order
  const p = buildVideoPrompt(shot);
  assert.match(p, /speaks this voice-over as a single continuous take, loosely following the shots in order/);
  assert.match(p, /finishing by about 28 seconds: "Still squeezing birthdays into your living room\? Step inside/);
  assert.doesNotMatch(p, /\d+–\d+ s — .*Narration:/);                                                          // 2026-11-12: per-shot pinning sounded mechanical
  const tooLong = beats.map((b, i) => (i === 0 ? { ...b, line: "word ".repeat(15).trim() } : b));               // 15 words in 3 s
  assert.match(JSON.stringify(videoShotSchema.safeParse({ ...base, beats: tooLong }).error.issues), /at most 13/);   // 6 + 4 slack + 3 hook spill
  const partial = beats.map((b, i) => (i === 1 ? { ...b, line: "" } : b));
  assert.ok(!videoShotSchema.safeParse({ ...base, beats: partial }).success);
});

test("narrator voice: chosen from the script's mood, described to Seedance as a natural person, never announcer-style", () => {
  const friendly = buildVideoPrompt(videoShotSchema.parse(videoShot()));
  assert.match(friendly, /VOICE: a Canadian host in their thirties showing a friend around a place they like.*; a smile on the hook\./);
  assert.match(friendly, /Delivery: one continuous, unhurried take at about two words per second/);
  // Positive cues only: naming the qualities to avoid ("robotic", "monotone") primed them (2026-11-12).
  assert.doesNotMatch(friendly, /robotic|monotone|text-to-speech|announcer|brand voice/i);
  const pro = buildVideoPrompt(videoShotSchema.parse(videoShot({ voice: "Professional" })));   // a bare mood string is accepted
  assert.match(pro, /VOICE: a Canadian host in their thirties walking a client through the room/);
  assert.ok(!videoShotSchema.safeParse(videoShot({ voice: undefined })).success);              // the agent must choose
  assert.ok(!videoShotSchema.safeParse(videoShot({ voice: { mood: "robotic" } })).success);
});

test("narration that reads like a listing description is sent back (routed to the narration rewrite)", () => {
  const brochure = videoShot().narration.replace("Step into this loft instead.", "This loft boasts an open plan.");
  const r = videoShotSchema.safeParse(videoShot({ narration: brochure }));
  assert.ok(!r.success);
  assert.match(JSON.stringify(r.error.issues), /the narration reads like a listing description \(\\"boasts\\"\)/);
});

test("narration: no ad-speak, and no people making sound the video model could voice (seen in a dry run)", () => {
  const n = videoShot().narration;
  for (const [swap, re] of [["It's pure magic.", /ad-speak \(\\"magic\\"\)/], ["Friends laughing at the table.", /people making sound \(\\"laughing\\"\)/], ["Cheers to good times!", /people making sound/]]) {
    const r = videoShotSchema.safeParse(videoShot({ narration: n.replace("Step into this loft instead.", swap) }));
    assert.match(JSON.stringify(r.error.issues), re, swap);
  }
});

test("the camera-safety check reads the camera and scene, not the narration (\"pull up a chair\")", () => {
  const n = videoShot().narration.replace("Step into this loft instead.", "Pull up a chair at the table.");
  assert.ok(videoShotSchema.safeParse(videoShot({ narration: n })).success);
  const base = videoShot().beats;
  assert.ok(!videoShotSchema.safeParse(videoShot({ beats: [base[0], { ...base[1], camera_detail: "camera pulls back to reveal the hall" }, ...base.slice(2)] })).success);
});

test("narration may not copy the style examples word for word (seen in a dry run)", () => {
  const swap = (text) => videoShot().narration.replace("It's made for birthdays that need room to breathe.", text);
  assert.match(JSON.stringify(videoShotSchema.safeParse(videoShot({ narration: swap("And that brick wall? That's where your wonky bowls go to become real.") })).error.issues), /copies the style example/);
  // the full-length example the narration writer sees is guarded too
  assert.match(JSON.stringify(videoShotSchema.safeParse(videoShot({ narration: swap("This is where your team's afternoon gets messy, in a good way.") })).error.issues), /copies the style example/);
  assert.ok(videoShotSchema.safeParse(videoShot()).success);   // the fixture's own wording is fine
});

test("hook: must name a real detail from the photos and carry no hype (seen live: 'every detail shines')", () => {
  const d = ["LED-screen stage with purple lighting", "white blossom centrepieces", "gold chiavari chairs"];
  assert.equal(hookProblems("Imagine a birthday party where every detail shines.", d).length, 2);          // no detail + hype
  assert.equal(hookProblems("Imagine your birthday party in a space like this!", d).length, 2);
  assert.match(hookProblems("The perfect stage for your birthday", d)[0], /generic hype \("perfect"\)/);    // names the stage, but hype
  assert.deepEqual(hookProblems("POV: your birthday dinner under white blossom trees and gold chairs.", d), []);
});

test("strategy: one desire, ≥3 hook types, short hook, no claims in hook or payoff", () => {
  assert.ok(socialStrategySchema.safeParse(socialStrategy).success);
  assert.ok(!socialStrategySchema.safeParse({ ...socialStrategy, desire: "belonging and status" }).success);
  const oneType = socialStrategy.hook_candidates.map((h) => ({ ...h, hook_type: "question" }));
  assert.ok(!socialStrategySchema.safeParse({ ...socialStrategy, hook_candidates: oneType }).success);                  // ≥2 types
  assert.ok(socialStrategySchema.safeParse({ ...socialStrategy, hook_candidates: socialStrategy.hook_candidates.slice(0, 3) }).success);   // 3 are enough
  assert.ok(!socialStrategySchema.safeParse({ ...socialStrategy, hook_candidates: socialStrategy.hook_candidates.slice(0, 2) }).success);
  assert.ok(!socialStrategySchema.safeParse({ ...socialStrategy, hook: { ...socialStrategy.hook, line: "word ".repeat(20) } }).success);
  assert.ok(!socialStrategySchema.safeParse({ ...socialStrategy, hook: { ...socialStrategy.hook, line: "Only 2 dates left this month" } }).success);
  assert.ok(!socialStrategySchema.safeParse({ ...socialStrategy, framework: "witness" }).success);        // needs proof Kangrooo doesn't have
});

test("prompts carry the truth rules, persona hints and history, and the rejection feedback", () => {
  const property = { title: "Sunny Loft", spaceCategory: "Social/Personal/Celebration", eventTypes: ["Birthday Parties"], city: "Toronto" };
  const history = { recentHooks: ["Still squeezing birthdays into your living room?"], propertyAngles: ["Birthday Parties — a parent — first birthday"] };
  const s = getSocialAgentPrompt({ business: { name: "Kangrooo" }, property, history, feedback: "beat 1 must end by 3 s" });
  assert.match(s.system, /No testimonials/);
  assert.match(s.system, /NEVER speak/); assert.match(s.system, /EVERY VIDEO IS A NARRATED PROMO/); assert.match(s.system, /ATTACHED IMAGES/);
  assert.match(s.system, /VOICE FITS THE MOOD OF YOUR SCRIPT/); assert.match(s.system, /A dedicated writer turns your drafts into the final voice-over/);
  assert.match(s.user, /"voice": \{ "mood": "professional \| friendly \| calm \| lively"/);
  assert.match(s.user, /Birthday Parties: someone planning a birthday/);
  assert.match(s.user, /Still squeezing birthdays/);
  assert.match(s.user, /PREVIOUS ANSWER WAS REJECTED[^\n]*beat 1 must end by 3 s/);
  const l = getLinkedInAgentPrompt({ business: {}, property });
  assert.match(l.system, /No urgency or scarcity/);
  assert.doesNotMatch(l.user, /REJECTED/);
});

test("narration sounds spoken: no caption-speak, camera words or filler; unhurried length (2026-11-12 Podcast Studio render)", () => {
  const withLines = (ls) => videoShot({ narration: undefined, beats: videoShot().beats.map((b, i) => ({ ...b, line: ls[i] })) });
  const ok = videoShotSchema.safeParse(withLines(shotLines));
  assert.ok(ok.success, ok.success ? "" : ok.error.issues.map((i) => i.message).join("; "));
  const fails = (ls, re) => {
    const r = videoShotSchema.safeParse(withLines(ls));
    assert.ok(!r.success && r.error.issues.some((i) => re.test(i.message)), String(re));
    // Every narration problem is phrased so the narration writer (not a full re-plan) fixes it.
    for (const i of r.error.issues) assert.match(i.message, /narration|line is \d+ words/);
  };
  fails(shotLines.map((l, i) => (i === 0 ? "POV: your birthday in a sunlit loft." : l)), /caption-speak \("POV"\)/);   // seen live
  fails(shotLines.map((l, i) => (i === 0 ? "Imagine your birthday right here." : l)), /caption-speak \("Imagine"\)/);
  fails(shotLines.map((l, i) => (i === 5 ? "Zoom out, see it all. Book it on Kangrooo." : l)), /talks about the camera \("Zoom"\)/);   // seen live
  fails(shotLines.map((l, i) => (i === 4 ? "And the floor has a fun party vibe." : l)), /filler \("vibe"\)/);
  // 60 words is the unhurried ceiling for 30 s (~2 words a second); the old ceiling of 75 sounded rushed.
  const long = videoShotSchema.safeParse(videoShot({ narration: videoShot().narration + " The windows face west, so the light stays warm well into the evening for you." }));
  assert.ok(!long.success && long.error.issues.some((i) => /narration must be 45–60 words/.test(i.message)));
  assert.ok(hookProblems("POV: your birthday with neon vibes on the long wooden table", spaceDetails).some((m) => /generic hype \("vibes"\)/.test(m)));
});

test("shots after the hook last 4–7 s, so the model's natural ~12-word lines fill them (2026-11-12 dry run)", () => {
  const b = videoShot().beats;
  const long = videoShotSchema.safeParse(videoShot({ beats: [b[0], { ...b[1], end_s: 15 }, ...b.slice(3)] }));   // 3–15 s: 12 s shot
  assert.ok(!long.success);
  const msg = long.error.issues.map((i) => i.message).find((m) => /^beat 2 lasts 12 s/.test(m));
  assert.ok(msg);
  // Must not be routed to the narration-only rewrite (generate-creative's NARRATION_PROBLEM), which can't fix timing.
  assert.doesNotMatch(msg, /narration|line is \d+ words|space_details|EVERY shot|^the hook /i);
  const tooShort = videoShotSchema.safeParse(videoShot({ beats: [b[0], b[1], b[2], b[3], { ...b[4], end_s: 28 }, { ...b[5], start_s: 28 }] }));   // 2 s closing shot
  assert.ok(!tooShort.success && tooShort.error.issues.some((i) => /^beat 6 lasts 2 s/.test(i.message)));
  assert.ok(videoShotSchema.safeParse(videoShot()).success);
});
