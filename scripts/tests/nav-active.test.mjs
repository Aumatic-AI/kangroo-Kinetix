// Pure-logic test for the sidebar's active-item rule (most specific href wins).
// Run: node --test scripts/tests/
import test from "node:test";
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
import assert from "node:assert/strict";
import { findActiveHref } from "../../src/config/nav-active.ts";

const HREFS = [
  "/dashboard", "/content", "/listings", "/content/automation",
  "/social/posts", "/social/published", "/social", "/social/connected-accounts", "/settings",
];

test("exact matches", () => {
  for (const h of HREFS) assert.equal(findActiveHref(h, HREFS), h);
});

test("the most specific href wins over its parent", () => {
  assert.equal(findActiveHref("/social/posts", HREFS), "/social/posts");
  assert.equal(findActiveHref("/content/automation", HREFS), "/content/automation");
  assert.equal(findActiveHref("/social", HREFS), "/social");
  assert.equal(findActiveHref("/content", HREFS), "/content");
});

test("detail routes keep their page highlighted", () => {
  assert.equal(findActiveHref("/social/posts/publish", HREFS), "/social/posts");
  assert.equal(findActiveHref("/listings/123", HREFS), "/listings");
  assert.equal(findActiveHref("/social/unknown-tab", HREFS), "/social");
});

test("no false prefix matches and trailing slashes are ignored", () => {
  assert.equal(findActiveHref("/contentious", HREFS), null);
  assert.equal(findActiveHref("/settings/", HREFS), "/settings");
  assert.equal(findActiveHref("/login", HREFS), null);
  assert.equal(findActiveHref("/", HREFS), null);
});
