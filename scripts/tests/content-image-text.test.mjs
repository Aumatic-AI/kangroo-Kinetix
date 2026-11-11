// The text hook rendered on LinkedIn images: headline rules and the exact-spelling verification.
// Run: node --test scripts/tests/
import test from "node:test";
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
import assert from "node:assert/strict";
// Dynamic: image-text.ts has relative imports, and static imports hoist above register().
const { hookSchema, normalizeText, parseTextRead, verifyRenderedText, LINKEDIN_TEXT_IMAGE_SUFFIX } = await import("../../src/services/content-automation/image-text.ts");
const { linkedinAgentSchema } = await import("../../src/services/content-automation/agents.ts");
import { linkedinPost } from "./creative-fixtures.mjs";

const ok = (headline) => hookSchema.safeParse({ headline });

test("hook headline: short, professional, plain words pass", () => {
  for (const h of ["Where does your next workshop belong?", "Meetings that feel different", "Room to think, room to grow"]) assert.ok(ok(h).success, h);
});

test("hook headline: rejects length, numbers, emoji, symbols and invented claims", () => {
  assert.ok(!ok("Short").success);                                                     // too short
  assert.ok(ok("Meet in style").success);                                              // 3 words is fine
  assert.ok(!ok("A very long headline that goes on and on and on forever").success);    // > 40 chars
  assert.ok(!ok("Workshop").success);                                                   // one word
  assert.ok(!ok("Top 10 venues for you").success);                                      // number
  assert.ok(!ok("Meet here 🚀 today").success);                                         // emoji
  assert.ok(!ok("Meet & greet #venue").success);                                        // symbols
  assert.ok(!ok("Only $99 per hour").success);                                          // price
  assert.ok(!ok("The best-rated venue in town").success);                               // superlative
});

test("linkedin agent plan requires a valid hook", () => {
  const good = linkedinAgentSchema.safeParse(linkedinPost());
  assert.ok(good.success, good.success ? "" : JSON.stringify(good.error.issues));
  assert.ok(!linkedinAgentSchema.safeParse(linkedinPost({ image: { visual_prompt: "clean meeting room, square" } })).success);
});

test("normalizeText ignores case, spacing, punctuation and accents", () => {
  assert.equal(normalizeText("Where does your next Workshop belong?"), normalizeText("where  does your next workshop belong"));
  assert.equal(normalizeText("Café"), "cafe");
});

const H = "Meetings that feel different";
const letters = (s) => s.replace(/\s+/g, "").split("").join("-");

test("verifyRenderedText: exact match passes", () => {
  assert.ok(verifyRenderedText(H, [{ text: H, letters: letters(H) }]).ok);
  assert.ok(verifyRenderedText(H, [{ text: "MEETINGS THAT FEEL DIFFERENT", letters: letters("MEETINGSTHATFEELDIFFERENT") }]).ok);   // case is free
});

test("verifyRenderedText: any misspelling fails, in either reading", () => {
  const bad = "Meetings that fel different";
  let v = verifyRenderedText(H, [{ text: bad, letters: letters(bad) }]);
  assert.ok(!v.ok); assert.equal(v.errors.length, 2);
  v = verifyRenderedText(H, [{ text: H, letters: letters("Meetings that feel diferent") }]);   // transcription "autocorrected", letters expose it
  assert.ok(!v.ok && /letter-by-letter/.test(v.errors[0]));
  assert.ok(!verifyRenderedText(H, [{ text: "Meetings that feel differnt", letters: letters(H) }]).ok);
});

test("verifyRenderedText: no text, or extra text anywhere, fails", () => {
  assert.ok(!verifyRenderedText(H, []).ok);
  const v = verifyRenderedText(H, [{ text: H, letters: letters(H) }, { text: "kangrooo", letters: "k-a-n-g-r-o-o-o" }]);
  assert.ok(!v.ok && /extra text/.test(v.errors[0]));
});

test("parseTextRead: tolerates code fences, rejects non-JSON", () => {
  const r = parseTextRead('```json\n{ "texts": [ { "text": "Hello there", "letters": "H-e-l-l-o" } ] }\n```');
  assert.deepEqual(r, [{ text: "Hello there", letters: "H-e-l-l-o" }]);
  assert.deepEqual(parseTextRead('{ "texts": [] }'), []);
  assert.throws(() => parseTextRead("no json here"));
});

test("image prompt carries the exact headline and forbids all other text", () => {
  const p = LINKEDIN_TEXT_IMAGE_SUFFIX(H);
  assert.ok(p.includes(`"${H}"`) && /No other text/.test(p) && /1:1/.test(p));
});
