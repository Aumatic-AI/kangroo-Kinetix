// Run: node --test scripts/tests/listings-lib.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeSearch, searchOrFilter, parseStatus, parsePaging, rotationEligibility, latestIso, toSummary } from "../../src/modules/listings/lib/listings.ts";

test("sanitizeSearch: strips PostgREST or()/LIKE metacharacters so input is only ever a substring", () => {
  assert.equal(sanitizeSearch("loft"), "loft");
  assert.equal(sanitizeSearch("  The   Work  Hub "), "The Work Hub");
  // injection attempts: closing the filter, adding another condition, wildcards
  const hostile = "x%,status.eq.inactive),or(title.ilike.%";
  const out = sanitizeSearch(hostile);
  assert.ok(!/[%,()*_\\"']/.test(out), `left metacharacters in: ${out}`);
  assert.equal(sanitizeSearch("100%_off\\"), "100 off");
  assert.equal(sanitizeSearch(null), ""); assert.equal(sanitizeSearch(undefined), ""); assert.equal(sanitizeSearch("   "), "");
  assert.equal(sanitizeSearch("a".repeat(500)).length, 80);
});

test("searchOrFilter: builds title/city/category OR filter, or null for empty", () => {
  assert.equal(searchOrFilter(""), null);
  assert.equal(searchOrFilter("(,)"), null);
  assert.equal(searchOrFilter("studio"), "title.ilike.%studio%,city.ilike.%studio%,space_category.ilike.%studio%");
  const f = searchOrFilter("a,b)");
  assert.equal((f.match(/,/g) || []).length, 2, "only the two separators we add");
});

test("parseStatus accepts only the two real statuses", () => {
  assert.equal(parseStatus("active"), "active"); assert.equal(parseStatus("inactive"), "inactive");
  for (const v of ["ACTIVE", "all", "", null, undefined, "active;drop"]) assert.equal(parseStatus(v), undefined);
});

test("parsePaging clamps untrusted input", () => {
  assert.deepEqual(parsePaging(null, null), { page: 1, limit: 10 });
  assert.deepEqual(parsePaging("3", "20"), { page: 3, limit: 20 });
  assert.deepEqual(parsePaging("-4", "0"), { page: 1, limit: 10 });
  assert.deepEqual(parsePaging("abc", "9999"), { page: 1, limit: 50 });
  assert.deepEqual(parsePaging("2.9", "7.9"), { page: 2, limit: 7 });
});

test("rotationEligibility mirrors the SQL rule (active + at least one non-broken image)", () => {
  const ok = [{ validationStatus: "unchecked" }];
  assert.deepEqual(rotationEligibility("active", ok), { eligible: true, reason: null });
  assert.equal(rotationEligibility("inactive", ok).eligible, false);
  assert.equal(rotationEligibility("active", []).reason, "No usable reference image");
  assert.equal(rotationEligibility("active", [{ validationStatus: "broken" }]).eligible, false);
  assert.equal(rotationEligibility("active", [{ validationStatus: "broken" }, { validationStatus: "ok" }]).eligible, true);
});

test("latestIso picks the newest, ignores nulls", () => {
  assert.equal(latestIso(null, undefined), null);
  assert.equal(latestIso("2026-01-01T00:00:00Z", null, "2026-03-01T00:00:00Z", "2026-02-01T00:00:00Z"), "2026-03-01T00:00:00Z");
});

test("toSummary: lowest-position image becomes the thumbnail; unknown status falls back to active; no image → null", () => {
  const row = { id: "1", title: "T", city: "Toronto", space_category: "Corporate", status: "inactive",
    property_images: [{ url: "b", position: 3 }, { url: "a", position: 1 }] };
  assert.deepEqual(toSummary(row, "2026-01-01T00:00:00Z"),
    { id: "1", title: "T", city: "Toronto", spaceCategory: "Corporate", status: "inactive", thumbnailUrl: "a", lastPromotedAt: "2026-01-01T00:00:00Z" });
  assert.equal(toSummary({ ...row, property_images: [] }, null).thumbnailUrl, null);
  assert.equal(toSummary({ ...row, property_images: null, status: "weird" }, null).status, "active");
});
