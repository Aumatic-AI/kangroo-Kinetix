// Listing photos as AI reference images: format normalization, Kie failure classification,
// the copyright fallback stages, and the franchise-name check. Offline (sharp builds the images).
// Run: node --test scripts/tests/content-references.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const sharp = (await import("sharp")).default;
const {
  sniffImageFormat, toReferenceJpeg, classifyKieFailure, referenceRisk, photosToClean, chooseVideoReferences,
  imageReferenceUrls, closestAspect, referenceScreenSchema, REFERENCE_MAX_SIDE, MAX_REFERENCE_STAGE,
} = await import("../../src/services/content-automation/reference-images.ts");
const { findNamedFranchises } = await import("../../src/services/content-automation/claims.ts");

const solid = (w, h, channels = 3) => sharp({ create: { width: w, height: h, channels, background: channels === 4 ? { r: 200, g: 0, b: 0, alpha: 0.3 } : { r: 120, g: 80, b: 200 } } });

// ---- format ---------------------------------------------------------------------
test("sniffImageFormat reads the real format from the bytes", async () => {
  assert.equal(sniffImageFormat(await solid(8, 8).jpeg().toBuffer()), "jpeg");
  assert.equal(sniffImageFormat(await solid(8, 8).png().toBuffer()), "png");
  assert.equal(sniffImageFormat(await solid(8, 8).webp().toBuffer()), "webp");
  const avifHeader = Buffer.concat([Buffer.from([0, 0, 0, 0x1c]), Buffer.from("ftypavif"), Buffer.alloc(16)]);
  assert.equal(sniffImageFormat(avifHeader), "avif");
  assert.equal(sniffImageFormat(Buffer.from("<html>not an image</html>")), "unknown");
});

test("a JPEG named .avif (the imported inventory) becomes a plain JPEG", async () => {
  const jpegBytes = await solid(640, 480).jpeg().toBuffer();   // what api.kangrooo.com serves as octet-stream
  const out = await toReferenceJpeg(jpegBytes);
  assert.equal(out.sourceFormat, "jpeg");
  assert.equal(sniffImageFormat(out.buffer), "jpeg");
  assert.deepEqual([out.width, out.height], [640, 480]);
});

test("transparent PNG and WebP are flattened to JPEG; big photos are capped, small ones not enlarged", async () => {
  for (const src of [await solid(300, 200, 4).png().toBuffer(), await solid(300, 200, 4).webp().toBuffer()]) {
    const out = await toReferenceJpeg(src);
    assert.equal(sniffImageFormat(out.buffer), "jpeg");
    const meta = await sharp(out.buffer).metadata();
    assert.equal(meta.hasAlpha, false);
  }
  const big = await toReferenceJpeg(await solid(5000, 2500).jpeg().toBuffer());
  assert.deepEqual([big.width, big.height], [REFERENCE_MAX_SIDE, REFERENCE_MAX_SIDE / 2]);
  const small = await toReferenceJpeg(await solid(320, 240).png().toBuffer());
  assert.deepEqual([small.width, small.height], [320, 240]);
});

test("non-images are rejected, not stored", async () => {
  await assert.rejects(() => toReferenceJpeg(Buffer.from("<html>403 Forbidden</html>")), /not a recognised image/);
});

// ---- Kie failures (exact messages observed 2026-11-13) ----------------------------------
test("classifyKieFailure", () => {
  assert.equal(classifyKieFailure("Content security audit did not pass; the output video may be related to copyright restrictions"), "copyright");
  assert.equal(classifyKieFailure("The request failed because the output video may be related to copyright restrictions."), "copyright");
  assert.equal(classifyKieFailure("Kie API Error 500: File type not supported"), "unsupported_file");
  assert.equal(classifyKieFailure("Video clip 1 failed: internal error"), "other");
  assert.equal(classifyKieFailure(null), "other");
});

// ---- copyright fallback stages ---------------------------------------------------------
const screen = (o = {}) => referenceScreenSchema.parse({ characters: [], brand_logos: [], watermark: null, app_ui: null, personal_text: null, identifiable_people: "none", screen_content: null, artwork: null, ...o });
const ref = (position, extra = {}) => ({ imageId: `i${position}`, position, sourceUrl: `src${position}`, url: `n${position}.jpg`, assetId: `a${position}`, width: 1000, height: 1000, screen: null, clean: null, ...extra });
const hk = screen({ characters: [{ name: "Hello Kitty", form: "balloon", prominence: "clear" }], watermark: "Angel's P" });

test("referenceRisk: only a prominent character is high risk; logos, watermarks, people are not", () => {
  assert.equal(referenceRisk(null), "low");
  assert.equal(referenceRisk(hk), "high");
  assert.equal(referenceRisk(screen({ characters: [{ name: "Belle", form: "cake topper", prominence: "small" }] })), "medium");
  assert.equal(referenceRisk(screen({ screen_content: "Dune: Part Two" })), "medium");
  assert.equal(referenceRisk(screen({ watermark: "PEERSPACE", app_ui: "Instagram avatar icon", identifiable_people: "prominent", brand_logos: [{ brand: "Coca-Cola", prominence: "dominant" }] })), "low");
});

test("the screening schema tolerates sloppy model output", () => {
  const s = referenceScreenSchema.parse({ characters: [{ name: "Mickey", prominence: "huge" }], identifiable_people: "lots" });
  assert.equal(s.characters[0].prominence, "small");
  assert.equal(s.identifiable_people, "none");
  assert.deepEqual(s.brand_logos, []);
});

test("photosToClean: the highest tier present, never low-risk photos, never one already cleaned", () => {
  const refs = [ref(1, { screen: hk }), ref(2, { screen: screen() }), ref(3, { screen: screen({ artwork: "mural" }) })];
  assert.deepEqual(photosToClean(refs).map((r) => r.position), [1]);
  assert.deepEqual(photosToClean([ref(1, { screen: screen() }), ref(3, { screen: screen({ artwork: "mural" }) })]).map((r) => r.position), [3]);
  assert.deepEqual(photosToClean([ref(1, { screen: hk, clean: { url: "c1.jpg", assetId: "c", verified: true, remaining: [] } })]), []);
  assert.deepEqual(photosToClean([ref(1, { screen: screen() })]), []);
});

test("Aviva Studio: stage 0 sends the first four, stage 1 swaps in the verified clean copy, stage 2 one safe photo", () => {
  const cleaned = { url: "c1.jpg", assetId: "c1", verified: true, remaining: [] };
  const before = [ref(1), ref(2), ref(3), ref(4), ref(5)];
  assert.deepEqual(chooseVideoReferences(before, 0), ["n1.jpg", "n2.jpg", "n3.jpg", "n4.jpg"]);
  const after = [ref(1, { screen: hk, clean: cleaned }), ref(2, { screen: screen() }), ref(3, { screen: screen() }), ref(4, { screen: screen() }), ref(5, { screen: screen({ characters: [{ name: "Belle", form: "cake topper", prominence: "small" }] }) })];
  assert.deepEqual(chooseVideoReferences(after, 1), ["c1.jpg", "n2.jpg", "n3.jpg", "n4.jpg"]);
  assert.deepEqual(chooseVideoReferences(after, 2), ["n2.jpg"]);
  // A later job for the same listing starts from the cleaned copy (no second rejection, no second clean).
  assert.deepEqual(chooseVideoReferences(after, 0), ["c1.jpg", "n2.jpg", "n3.jpg", "n4.jpg"]);
  assert.deepEqual(imageReferenceUrls(after), ["c1.jpg", "n2.jpg", "n3.jpg", "n4.jpg", "n5.jpg"]);
});

test("a risky photo whose cleaning failed or didn't verify is dropped, never resent", () => {
  const refs = [ref(1, { screen: hk, clean: { url: "c1.jpg", assetId: "c1", verified: false, remaining: ["Hello Kitty"] } }), ref(2, { screen: hk }), ref(3, { screen: screen() })];
  assert.deepEqual(chooseVideoReferences(refs, 0), ["n1.jpg", "n2.jpg", "n3.jpg"]);   // unverified copy is not used
  assert.deepEqual(chooseVideoReferences(refs, 1), ["n3.jpg"]);
  assert.deepEqual(chooseVideoReferences(refs, 2), ["n3.jpg"]);
});

test("nothing safe left → empty (the job then fails permanently instead of retrying)", () => {
  assert.deepEqual(chooseVideoReferences([ref(1, { screen: hk }), ref(2, { screen: hk })], 1), []);
  assert.deepEqual(chooseVideoReferences([ref(1, { screen: hk })], 2), []);
  assert.equal(MAX_REFERENCE_STAGE, 2);
});

test("closestAspect for the cleaning edit", () => {
  assert.equal(closestAspect(1289, 1217), "1:1");
  assert.equal(closestAspect(815, 517), "16:9");
  assert.equal(closestAspect(1080, 1350), "4:5");
  assert.equal(closestAspect(1080, 1920), "9:16");
  assert.equal(closestAspect(0, 0), "1:1");
});

// ---- franchise names in plans -----------------------------------------------------------
test("findNamedFranchises catches the characters seen in the inventory", () => {
  assert.deepEqual(findNamedFranchises("Pink balloons and a giant Hello Kitty by the stage"), ["hello kitty"]);
  assert.ok(findNamedFranchises("a Belle from Beauty and the Beast cake").length >= 1);
  assert.ok(findNamedFranchises("a wall of Spider-Man and Mickey paintings").length >= 2);
  assert.ok(findNamedFranchises("a Simpsons arcade cabinet").includes("simpsons"));
  assert.ok(findNamedFranchises("Santa and the Grinch on stage").some((h) => h.includes("grinch")));
});

test("findNamedFranchises leaves ordinary venue language alone", () => {
  for (const t of [
    "frozen yogurt bar and frozen cocktails", "jasmine tea on the side table", "northern lights, aurora-style LED wash",
    "stitched leather chairs", "a belle époque mirror", "pink and white balloons around a themed cake", "an arcade cabinet by the window",
  ]) assert.deepEqual(findNamedFranchises(t), [], t);
});
