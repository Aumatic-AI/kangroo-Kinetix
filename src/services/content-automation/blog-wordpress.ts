import type { BlogBlock } from "./blog";

/**
 * Blog → WordPress, the pure parts (no I/O, unit-tested in
 * scripts/tests/content-blog-wordpress.test.mjs): the post body as block-editor
 * (Gutenberg) markup, how a WordPress error is classified, and how the worker
 * recognises its own post after a lost response.
 *
 * Block text is plain text by contract (validateBlogContent rejects raw HTML), so
 * everything is escaped. The hero image is NOT in the body: it becomes the post's
 * featured image, which the theme shows above the post.
 */

export interface WordPressImage { id: number; url: string; alt: string; caption: string }

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

const block = (name: string, inner: string, attrs?: Record<string, unknown>) =>
  `<!-- wp:${name}${attrs && Object.keys(attrs).length ? " " + JSON.stringify(attrs) : ""} -->\n${inner}\n<!-- /wp:${name} -->`;

const paragraph = (html: string) => block("paragraph", `<p>${html}</p>`);
const heading = (text: string, level: 2 | 3) =>
  block("heading", `<h${level} class="wp-block-heading">${escapeHtml(text)}</h${level}>`, level === 2 ? undefined : { level });

function image(img: WordPressImage): string {
  const caption = img.caption ? `<figcaption class="wp-element-caption">${escapeHtml(img.caption)}</figcaption>` : "";
  return block(
    "image",
    `<figure class="wp-block-image size-large"><img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.alt)}" class="wp-image-${img.id}"/>${caption}</figure>`,
    { id: img.id, sizeSlug: "large", linkDestination: "none" },
  );
}

/** The post body. `images` maps the blog's image ids to their uploaded WordPress media. */
export function blogToWordPressHtml(blocks: BlogBlock[], images: Record<string, WordPressImage | undefined>): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "heading": out.push(heading(b.text, b.level === 3 ? 3 : 2)); break;
      case "paragraph": out.push(paragraph(escapeHtml(b.text))); break;
      case "list": {
        const tag = b.style === "numbered" ? "ol" : "ul";
        const items = b.items.map((it) => block("list-item", `<li>${escapeHtml(it)}</li>`)).join("\n");
        out.push(block("list", `<${tag} class="wp-block-list">${items}</${tag}>`, b.style === "numbered" ? { ordered: true } : undefined));
        break;
      }
      case "callout": {
        const label = b.label ? `<strong>${escapeHtml(b.label)}:</strong> ` : "";
        out.push(block("quote", `<blockquote class="wp-block-quote">${paragraph(label + escapeHtml(b.text))}</blockquote>`));
        break;
      }
      case "faq":
        for (const f of b.items) out.push(heading(f.q, 3), paragraph(escapeHtml(f.a)));
        break;
      case "image": {
        const img = images[b.image_id];
        if (img) out.push(image(img));
        break;
      }
    }
  }
  return out.join("\n\n");
}

/**
 * What to do after a failed WordPress request. `status` is the HTTP status, or null
 * when no response arrived (network error / timeout).
 * - retry: no response, timeout, rate limit or server error. The request may still have
 *   landed, which is safe: the next attempt looks for its own post before creating one.
 * - failed: WordPress answered with a definite rejection (bad credentials, missing
 *   permission, invalid data). Retrying won't help until someone fixes the cause.
 */
export function classifyWordPressFailure(status: number | null): "retry" | "failed" {
  if (status === null || status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) return "retry";
  return "failed";
}

export interface WordPressPostSummary { id: number; link: string; title: { raw?: string; rendered?: string }; date_gmt: string }

/**
 * The post this publication already created, if any: same exact title, created no
 * earlier than the publication row (minus clock skew). WordPress has no idempotency
 * key, so this is how a retry after a lost response avoids a duplicate post.
 */
export function findOwnPost(posts: WordPressPostSummary[], title: string, notBefore: Date): WordPressPostSummary | null {
  const cutoff = notBefore.getTime() - 10 * 60_000;
  for (const p of posts) {
    const t = p.title.raw ?? "";
    const created = Date.parse(p.date_gmt.endsWith("Z") ? p.date_gmt : p.date_gmt + "Z");
    if (t.trim() === title.trim() && Number.isFinite(created) && created >= cutoff) return p;
  }
  return null;
}
