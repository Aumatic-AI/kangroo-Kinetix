// Blog → WordPress pure logic: block markup, escaping, failure classification, own-post lookup.
// Run: node --test scripts/tests/
import test from "node:test";
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
import assert from "node:assert/strict";
const { blogToWordPressHtml, classifyWordPressFailure, findOwnPost, escapeHtml } = await import("../../src/services/content-automation/blog-wordpress.ts");

const img = { id: 42, url: "https://blog.example.com/wp-content/uploads/a.jpg", alt: "Studio \"A\"", caption: "Natural light" };

test("renders every block type as block-editor markup", () => {
  const html = blogToWordPressHtml([
    { type: "heading", level: 2, text: "Why it works" },
    { type: "heading", level: 3, text: "Light" },
    { type: "paragraph", text: "Bring your own props." },
    { type: "list", style: "bullet", items: ["One", "Two"] },
    { type: "list", style: "numbered", items: ["First"] },
    { type: "callout", label: "Tip", text: "Ask the host about parking." },
    { type: "faq", items: [{ q: "Is there Wi-Fi?", a: "Check with the host." }] },
    { type: "image", image_id: "i1" },
  ], { i1: img });
  assert.match(html, /<!-- wp:heading -->\n<h2 class="wp-block-heading">Why it works<\/h2>\n<!-- \/wp:heading -->/);
  assert.match(html, /<!-- wp:heading \{"level":3\} -->\n<h3 class="wp-block-heading">Light<\/h3>/);
  assert.match(html, /<!-- wp:paragraph -->\n<p>Bring your own props\.<\/p>\n<!-- \/wp:paragraph -->/);
  assert.match(html, /<!-- wp:list -->\n<ul class="wp-block-list"><!-- wp:list-item -->\n<li>One<\/li>/);
  assert.match(html, /<!-- wp:list \{"ordered":true\} -->\n<ol class="wp-block-list">/);
  assert.match(html, /<blockquote class="wp-block-quote"><!-- wp:paragraph -->\n<p><strong>Tip:<\/strong> Ask the host about parking\.<\/p>/);
  assert.match(html, /<h3 class="wp-block-heading">Is there Wi-Fi\?<\/h3>[\s\S]*<p>Check with the host\.<\/p>/);
  assert.match(html, /<!-- wp:image \{"id":42,"sizeSlug":"large","linkDestination":"none"\} -->/);
  assert.match(html, /<img src="https:\/\/blog\.example\.com\/wp-content\/uploads\/a\.jpg" alt="Studio &quot;A&quot;" class="wp-image-42"\/><figcaption class="wp-element-caption">Natural light<\/figcaption>/);
});

test("escapes text and skips images that weren't uploaded", () => {
  const html = blogToWordPressHtml([
    { type: "paragraph", text: "Fish & chips <script>alert(1)</script>" },
    { type: "image", image_id: "missing" },
  ], {});
  assert.ok(html.includes("Fish &amp; chips &lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("wp:image"));
  assert.equal(escapeHtml(`'"<>&`), "&#039;&quot;&lt;&gt;&amp;");
});

test("classifies WordPress failures: transient → retry, definite rejection → failed", () => {
  for (const s of [null, 408, 429, 500, 502, 503]) assert.equal(classifyWordPressFailure(s), "retry", String(s));
  for (const s of [400, 401, 403, 404, 413]) assert.equal(classifyWordPressFailure(s), "failed", String(s));
});

test("findOwnPost adopts only an exact-title post created after the publication", () => {
  const created = new Date("2027-01-10T12:00:00Z");
  const posts = [
    { id: 1, link: "https://b/old", title: { raw: "Same Title" }, date_gmt: "2026-07-01T05:00:00" },        // old post, same title
    { id: 2, link: "https://b/other", title: { raw: "Same Title, longer" }, date_gmt: "2027-01-10T12:01:00" }, // search hit, different title
    { id: 3, link: "https://b/ours", title: { raw: "Same Title" }, date_gmt: "2027-01-10T12:02:00" },
  ];
  assert.equal(findOwnPost(posts, "Same Title", created)?.id, 3);
  assert.equal(findOwnPost(posts.slice(0, 2), "Same Title", created), null);
  // Small clock skew between our DB and WordPress is tolerated.
  assert.equal(findOwnPost([{ id: 4, link: "x", title: { raw: "T" }, date_gmt: "2027-01-10T11:55:00" }], "T", created)?.id, 4);
});
