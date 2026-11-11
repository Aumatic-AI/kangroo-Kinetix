import test from "node:test";
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
import assert from "node:assert/strict";
// Dynamic import: static imports hoist above register(), so the hook would not apply to platform-copy's relative imports.
const { buildLinkedInPost, copyErrors, LINKEDIN_SAFE_MAX, LINKEDIN_MAX_CHARS } = await import("../../src/services/content-automation/platform-copy.ts");

const w = "Plan your next workshop around a flexible, light-filled room. ";
test("short LinkedIn post is untouched", () => {
  const p = buildLinkedInPost({ text: w.repeat(5), hashtags: ["a", "b"] }).linkedin;
  assert.equal(p.truncated, false);
  assert.deepEqual(copyErrors({ linkedin: p }), []);
});
test("over-long LinkedIn post is cut under the cap and flagged", () => {
  const p = buildLinkedInPost({ text: w.repeat(100), hashtags: ["a", "b", "c"] }).linkedin;
  const full = `${p.text}\n\n${p.hashtags.map((t) => "#" + t).join(" ")}`;
  assert.ok(p.truncated);
  assert.ok(full.length <= LINKEDIN_SAFE_MAX && LINKEDIN_SAFE_MAX < LINKEDIN_MAX_CHARS);
  assert.ok(copyErrors({ linkedin: p }).some((e) => /exceeded/.test(e)));
});
