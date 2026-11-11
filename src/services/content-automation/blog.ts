import { z } from "zod";
import { AD_DISCLOSURE_RULES, URGENCY_RULES } from "./claims";

/**
 * Blog posts for content automation: the AI agent's output schema, the
 * deterministic checks that stand between generated text and a "valid"
 * revision, and the Markdown rendering. Pure functions — no I/O.
 *
 * The format is NOT fixed. The agent chooses the post's format, angle, section
 * structure, length and how many images to use (and where) on every run, so the
 * schema only constrains the building blocks, not the shape of the post.
 */

const text = z.string().trim().min(1);

export const blogBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), level: z.coerce.number().int().min(2).max(3).default(2), text }),
  z.object({ type: z.literal("paragraph"), text }),
  z.object({ type: z.literal("list"), style: z.enum(["bullet", "numbered"]).default("bullet"), items: z.array(text).min(1).max(20) }),
  z.object({ type: z.literal("callout"), label: z.string().trim().max(40).default(""), text }),
  z.object({ type: z.literal("faq"), items: z.array(z.object({ q: text, a: text })).min(1).max(12) }),
  z.object({ type: z.literal("image"), image_id: text }),
]);
export type BlogBlock = z.infer<typeof blogBlockSchema>;

export const blogImageSchema = z.object({
  id: text,
  role: z.enum(["hero", "inline"]),
  visual_prompt: z.string().trim().min(15),
  alt: text,
  caption: z.string().trim().default(""),
});
export type BlogImagePlan = z.infer<typeof blogImageSchema>;

const tags = z.array(z.string()).transform((a) =>
  [...new Set(a.map((t) => t.replace(/^#+/, "").trim().toLowerCase()).filter(Boolean))].slice(0, 8)
);

export const MAX_BLOG_IMAGES = 4;

export const blogAgentSchema = z.object({
  /** Free-text label for the format the AI picked, e.g. "event planning guide". */
  format: z.string().trim().min(3).max(80),
  format_reason: z.string().default(""),
  /** The specific topic/angle chosen for THIS listing. */
  angle: z.string().trim().min(10),
  /** Why this angle suits this listing. */
  reason: z.string().default(""),
  title: z.string().trim().min(1),
  slug: z.string().trim().default(""),
  meta_description: z.string().trim().min(1),
  tags: tags.default([]),
  blocks: z.array(blogBlockSchema).min(4),
  images: z.array(blogImageSchema).min(1).max(MAX_BLOG_IMAGES),
}).superRefine((v, ctx) => {
  const ids = v.images.map((i) => i.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "image ids must be unique" });
  const heroes = v.images.filter((i) => i.role === "hero");
  if (heroes.length !== 1) ctx.addIssue({ code: "custom", message: "exactly one image must have role \"hero\"" });
  const inline = new Set(v.images.filter((i) => i.role === "inline").map((i) => i.id));
  const used: string[] = [];
  for (const b of v.blocks) if (b.type === "image") used.push(b.image_id);
  for (const id of used) if (!inline.has(id)) ctx.addIssue({ code: "custom", message: `image block references unknown or hero image "${id}"` });
  for (const id of inline) if (used.filter((u) => u === id).length !== 1) ctx.addIssue({ code: "custom", message: `inline image "${id}" must appear in exactly one image block` });
});
export type BlogAgentOutput = z.infer<typeof blogAgentSchema>;

export function slugify(input: string): string {
  return input.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "post";
}

/** Plain text of every block (headings, paragraphs, list items, callouts, FAQ), in order. */
export function blogPlainText(title: string, metaDescription: string, blocks: BlogBlock[]): string {
  const parts: string[] = [title, metaDescription];
  for (const b of blocks) {
    if (b.type === "heading" || b.type === "paragraph") parts.push(b.text);
    else if (b.type === "callout") parts.push(b.label, b.text);
    else if (b.type === "list") parts.push(...b.items);
    else if (b.type === "faq") for (const f of b.items) parts.push(f.q, f.a);
  }
  return parts.filter(Boolean).join("\n");
}

export function countBlogWords(blocks: BlogBlock[]): number {
  const body = blogPlainText("", "", blocks);
  return body.split(/\s+/).filter(Boolean).length;
}

/**
 * The fabrications that must never reach a listing blog: prices, discounts,
 * guest/size numbers, rates and unearned superlatives. Same intent as
 * `findUnsupportedClaims` in agents.ts, but without its two broad rules ("from 3
 * weeks", "up to 2 hours") that would flag ordinary planning advice in a long
 * article. Shares the urgency and "not an ad" rules. A hit makes the revision
 * invalid, not published.
 */
export function findUnsupportedBlogClaims(textToCheck: string): string[] {
  const hits: string[] = [];
  const rules: [RegExp, string][] = [
    [/[$€£]\s?\d/, "price"],
    [/\b\d+(\.\d+)?\s?%\s?(off|discount)/i, "discount"],
    [/\b\d{2,}\s*(guests?|people|persons|attendees|seats|pax)\b/i, "capacity"],
    [/\b(capacity of|fits|seats)\s+(up to\s+)?\d+/i, "capacity"],
    [/\b\d{3,}\s*(sq\.?\s?ft|square (feet|foot)|sqft|m2|sq\.?\s?m)\b/i, "dimensions"],
    [/\b\d+(\.\d+)?\s*(\/|per)\s*(hour|hr|night|day)\b/i, "rate"],
    [/\b(5-star|five-star|award-winning|#1|best-rated)\b/i, "unsupported superlative"],
    ...URGENCY_RULES,
    ...AD_DISCLOSURE_RULES,
  ];
  for (const [re, label] of rules) if (re.test(textToCheck) && !hits.includes(label)) hits.push(label);
  return hits;
}

export interface BlogCheck { ok: boolean; errors: string[]; wordCount: number }

/** Deterministic checks on a finished blog (text only; image generation is checked by the caller). */
export function validateBlogContent(input: {
  title: string;
  slug: string;
  metaDescription: string;
  blocks: BlogBlock[];
  minWords?: number;
}): BlogCheck {
  const errors: string[] = [];
  const minWords = input.minWords ?? 450;
  const wordCount = countBlogWords(input.blocks);

  if (input.title.length < 15 || input.title.length > 110) errors.push("title must be 15–110 characters");
  if (input.metaDescription.length < 40 || input.metaDescription.length > 200) errors.push("meta description must be 40–200 characters");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(input.slug)) errors.push("slug must be lowercase words separated by hyphens");
  if (wordCount < minWords) errors.push(`post is too short (${wordCount} words, minimum ${minWords})`);
  if (wordCount > 3000) errors.push(`post is too long (${wordCount} words, maximum 3000)`);
  if (input.blocks.filter((b) => b.type === "heading").length < 2) errors.push("post needs at least two section headings");
  if (input.blocks.filter((b) => b.type === "paragraph").length < 3) errors.push("post needs at least three paragraphs");

  const all = blogPlainText(input.title, input.metaDescription, input.blocks);
  if (/<\/?[a-z][^>]*>/i.test(all)) errors.push("post contains raw HTML");
  const claims = findUnsupportedBlogClaims(all);
  if (claims.length) errors.push(`unsupported claims in text: ${claims.join(", ")}`);
  return { ok: errors.length === 0, errors, wordCount };
}

export interface RenderedBlogImage { url: string; alt: string; caption: string }

/**
 * The whole post as Markdown (title, hero, body, tags), with generated images
 * inlined by URL. This is what "Copy Markdown" in the gallery copies.
 */
export function blogToMarkdown(input: {
  title: string;
  metaDescription: string;
  blocks: BlogBlock[];
  hero: RenderedBlogImage | null;
  images: Record<string, RenderedBlogImage | undefined>;
  tags: string[];
}): string {
  const out: string[] = [`# ${input.title}`, ""];
  if (input.metaDescription) out.push(`_${input.metaDescription}_`, "");
  if (input.hero) out.push(`![${input.hero.alt}](${input.hero.url})`, ...(input.hero.caption ? [`*${input.hero.caption}*`] : []), "");
  for (const b of input.blocks) {
    switch (b.type) {
      case "heading": out.push(`${"#".repeat(b.level)} ${b.text}`, ""); break;
      case "paragraph": out.push(b.text, ""); break;
      case "list": out.push(...b.items.map((it, i) => (b.style === "numbered" ? `${i + 1}. ${it}` : `- ${it}`)), ""); break;
      case "callout": out.push(`> ${b.label ? `**${b.label}:** ` : ""}${b.text}`, ""); break;
      case "faq": for (const f of b.items) out.push(`**${f.q}**`, "", f.a, ""); break;
      case "image": {
        const img = input.images[b.image_id];
        if (img) out.push(`![${img.alt}](${img.url})`, ...(img.caption ? [`*${img.caption}*`] : []), "");
        break;
      }
    }
  }
  if (input.tags.length) out.push(`Tags: ${input.tags.map((t) => `#${t}`).join(" ")}`, "");
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
