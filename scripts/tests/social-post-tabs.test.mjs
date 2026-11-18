// The Posts page's status tabs (one page; the old Published page is its Published tab).
// Run: node --test scripts/tests/
import test from "node:test";
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
import assert from "node:assert/strict";
const { matchesStatusFilter, parseStatusFilter, STATUS_FILTERS } = await import("../../src/modules/social/lib/postGroups.ts");

const group = (...statuses) => ({ rows: statuses.map((status, i) => ({ id: `r${i}`, status })) });
const tabsOf = (g) => STATUS_FILTERS.filter((f) => matchesStatusFilter(g, f));

test("every tab shows the posts with a platform in that state; All shows everything", () => {
  assert.deepEqual(tabsOf(group("draft", "draft")), ["all", "drafts"]);
  assert.deepEqual(tabsOf(group("scheduled")), ["all", "scheduled"]);
  assert.deepEqual(tabsOf(group("published", "published")), ["all", "published"]);
  assert.deepEqual(tabsOf(group("failed")), ["all", "failed"]);
  assert.deepEqual(tabsOf(group("generating")), ["all"], "in-progress posts appear under All");
  assert.deepEqual(tabsOf(group("publishing")), ["all"]);
});

test("a post that went out on some platforms and failed on another shows under BOTH tabs", () => {
  assert.deepEqual(tabsOf(group("published", "published", "failed")), ["all", "published", "failed"]);
  assert.deepEqual(tabsOf(group("published", "draft")), ["all", "drafts", "published"]);
});

test("?status= is parsed safely; anything unknown means All", () => {
  for (const f of STATUS_FILTERS) assert.equal(parseStatusFilter(f), f);
  for (const v of [null, undefined, "", "Published", "toString", "garbage"]) assert.equal(parseStatusFilter(v), "all");
});
