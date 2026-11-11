// Pure-logic tests for the blog pipeline (agent schema, validation, claims, Markdown).
// Run: node --test scripts/tests/
import test from "node:test";
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
import assert from "node:assert/strict";
// Dynamic: blog.ts has a relative import, and static imports hoist above register().
const {
  blogAgentSchema, validateBlogContent, findUnsupportedBlogClaims, blogToMarkdown, countBlogWords, slugify,
} = await import("../../src/services/content-automation/blog.ts");

const sentence = "Plan the flow of the day around how people will actually move through the room and where they will gather.";
const para = (n = 1) => ({ type: "paragraph", text: Array.from({ length: 6 * n }, () => sentence).join(" ") });

function validPost(overrides = {}) {
  return {
    format: "event planning guide",
    format_reason: "The listing supports several event types, which suits a planning guide.",
    angle: "How to plan a small workshop in a bright, flexible space",
    reason: "Photos show an open floor and large windows.",
    title: "Planning a Workshop in a Bright, Flexible Space",
    slug: "planning-a-workshop-in-a-bright-flexible-space",
    meta_description: "A practical guide to planning a workshop in a flexible, light-filled venue.",
    tags: ["#Workshops", "venue planning", "workshops"],
    blocks: [
      para(2), { type: "heading", level: 2, text: "Start with the purpose" }, para(2),
      { type: "image", image_id: "img2" },
      { type: "heading", level: 2, text: "Layout and flow" }, para(2),
      { type: "list", style: "bullet", items: ["Arrival and check-in", "Main session", "Breaks"] },
      { type: "callout", label: "Tip", text: "Ask the host what equipment is available." },
      { type: "faq", items: [{ q: "Can I visit first?", a: "Ask the host whether a visit can be arranged." }] },
    ],
    images: [
      { id: "hero", role: "hero", visual_prompt: "Wide landscape view of the open room with large windows", alt: "The open room", caption: "" },
      { id: "img2", role: "inline", visual_prompt: "Close view of a long table near the windows", alt: "Long table", caption: "A place to gather" },
    ],
    ...overrides,
  };
}

test("blogAgentSchema: accepts a valid post, normalises tags", () => {
  const r = blogAgentSchema.safeParse(validPost());
  assert.ok(r.success, r.success ? "" : JSON.stringify(r.error.issues));
  assert.deepEqual(r.data.tags, ["workshops", "venue planning"]);
});

test("blogAgentSchema: format is free text (the AI decides it each run)", () => {
  for (const format of ["FAQ explainer", "photo-led visual tour", "choosing a space for a team offsite"]) {
    assert.ok(blogAgentSchema.safeParse(validPost({ format })).success);
  }
});

test("blogAgentSchema: image rules", () => {
  const post = validPost();
  // no hero
  assert.ok(!blogAgentSchema.safeParse(validPost({ images: [{ ...post.images[1], role: "inline" }] })).success);
  // two heroes
  assert.ok(!blogAgentSchema.safeParse(validPost({ images: [post.images[0], { ...post.images[1], role: "hero" }] })).success);
  // inline image never placed in the body
  assert.ok(!blogAgentSchema.safeParse(validPost({ blocks: post.blocks.filter((b) => b.type !== "image") })).success);
  // block references an unknown image / the hero
  assert.ok(!blogAgentSchema.safeParse(validPost({ blocks: [...post.blocks, { type: "image", image_id: "nope" }] })).success);
  assert.ok(!blogAgentSchema.safeParse(validPost({ blocks: [...post.blocks, { type: "image", image_id: "hero" }] })).success);
  // duplicate ids
  assert.ok(!blogAgentSchema.safeParse(validPost({ images: [post.images[0], { ...post.images[1], id: "hero" }] })).success);
  // more than 4 images
  const many = [post.images[0], ...[2, 3, 4, 5].map((n) => ({ ...post.images[1], id: `img${n}` }))];
  assert.ok(!blogAgentSchema.safeParse(validPost({ images: many })).success);
});

test("blogAgentSchema: unknown block types are rejected", () => {
  const post = validPost();
  assert.ok(!blogAgentSchema.safeParse(validPost({ blocks: [...post.blocks, { type: "html", text: "<b>x</b>" }] })).success);
});

test("validateBlogContent: a good post passes", () => {
  const p = validPost();
  const r = validateBlogContent({ title: p.title, slug: p.slug, metaDescription: p.meta_description, blocks: blogAgentSchema.parse(p).blocks });
  assert.deepEqual(r.errors, []);
  assert.ok(r.ok);
  assert.ok(r.wordCount >= 450);
});

test("validateBlogContent: catches short, malformed and fabricated posts", () => {
  const p = validPost();
  const blocks = blogAgentSchema.parse(p).blocks;
  const base = { title: p.title, slug: p.slug, metaDescription: p.meta_description, blocks };
  assert.ok(validateBlogContent({ ...base, blocks: [para(), { type: "heading", level: 2, text: "A" }, { type: "heading", level: 2, text: "B" }, para(), para()].map((b) => (b.type === "paragraph" ? { type: "paragraph", text: "Too short." } : b)) }).errors.some((e) => /too short/.test(e)));
  assert.ok(validateBlogContent({ ...base, title: "Short" }).errors.some((e) => /title/.test(e)));
  assert.ok(validateBlogContent({ ...base, slug: "Not A Slug" }).errors.some((e) => /slug/.test(e)));
  assert.ok(validateBlogContent({ ...base, metaDescription: "tiny" }).errors.some((e) => /meta/.test(e)));
  assert.ok(validateBlogContent({ ...base, blocks: [...blocks, { type: "paragraph", text: "Rooms from $250 per hour." }] }).errors.some((e) => /unsupported claims/.test(e)));
  assert.ok(validateBlogContent({ ...base, blocks: [...blocks, { type: "paragraph", text: "Use <b>bold</b> text." }] }).errors.some((e) => /HTML/.test(e)));
  assert.ok(validateBlogContent({ ...base, blocks: blocks.filter((b) => b.type !== "heading") }).errors.some((e) => /heading/.test(e)));
});

test("findUnsupportedBlogClaims: flags property fabrications, allows ordinary advice", () => {
  assert.deepEqual(findUnsupportedBlogClaims("Book three to four weeks ahead. Plan from 2 to 3 hours of setup. Up to a week before is fine."), []);
  assert.ok(findUnsupportedBlogClaims("Only $50 to book.").includes("price"));
  assert.ok(findUnsupportedBlogClaims("Enjoy 20% off this month").includes("discount"));
  assert.ok(findUnsupportedBlogClaims("It holds 120 guests easily").includes("capacity"));
  assert.ok(findUnsupportedBlogClaims("The room fits 40 comfortably").includes("capacity"));
  assert.ok(findUnsupportedBlogClaims("About 2000 sq ft of space").includes("dimensions"));
  assert.ok(findUnsupportedBlogClaims("Priced at 80/hour").includes("rate"));
  assert.ok(findUnsupportedBlogClaims("The best-rated venue in town").includes("unsupported superlative"));
});

test("blogToMarkdown: title, hero, body, inline image and tags", () => {
  const p = blogAgentSchema.parse(validPost());
  const md = blogToMarkdown({
    title: p.title, metaDescription: p.meta_description, blocks: p.blocks, tags: p.tags,
    hero: { url: "https://x/hero.jpg", alt: "The open room", caption: "" },
    images: { img2: { url: "https://x/2.jpg", alt: "Long table", caption: "A place to gather" } },
  });
  assert.match(md, /^# Planning a Workshop/);
  assert.match(md, /!\[The open room\]\(https:\/\/x\/hero\.jpg\)/);
  assert.match(md, /!\[Long table\]\(https:\/\/x\/2\.jpg\)\n\*A place to gather\*/);
  assert.match(md, /## Start with the purpose/);
  assert.match(md, /- Arrival and check-in/);
  assert.match(md, /> \*\*Tip:\*\* Ask the host/);
  assert.match(md, /\*\*Can I visit first\?\*\*/);
  assert.match(md, /Tags: #workshops #venue planning/);
  assert.ok(!/\n{3,}/.test(md));
});

test("countBlogWords counts every text-bearing block", () => {
  assert.equal(countBlogWords([{ type: "paragraph", text: "one two three" }, { type: "list", style: "bullet", items: ["four five"] }, { type: "faq", items: [{ q: "six?", a: "seven eight" }] }]), 8);
});

test("slugify", () => {
  assert.equal(slugify("Planning a Workshop — in Montréal!"), "planning-a-workshop-in-montreal");
  assert.equal(slugify("!!!"), "post");
});
