import { findUnsupportedClaims } from "./agents";
import { SOCIAL_PLATFORM_IDS, type SocialPlatformId } from "./platform-specs";

/**
 * Builds the final post text per platform from the AI's base caption, its
 * optional per-platform caption and the shared hashtags — within each
 * platform's own limits. This is the payload a future publisher reads; it is
 * stored on the revision and shown in the gallery. Pure.
 *
 * Limits: Instagram 2,200 chars (Meta; the platform allows 30 hashtags). TikTok
 * 2,200 chars (Content Posting API title). Facebook allows far more; we keep a
 * sensible 5,000. Hashtag caps are house rules from the creative playbook
 * (docs/prodo-creative-knowledge.md §6.5), not platform limits: 3–5 specific tags
 * on Instagram/TikTok/LinkedIn, at most 3 on Facebook.
 *
 * LinkedIn's (and Upload-Post's) cap is 3,000 chars including spaces, hashtags and
 * URLs. We enforce LINKEDIN_SAFE_MAX (2,900) so emoji/counting differences between
 * JS string length and LinkedIn's counter can never push a post over.
 */
export const LINKEDIN_MAX_CHARS = 3000;
export const LINKEDIN_SAFE_MAX = 2900;
export interface CopyRules { maxChars: number; maxHashtags: number }

export const COPY_RULES: Record<SocialPlatformId | "linkedin", CopyRules> = {
  instagram: { maxChars: 2200, maxHashtags: 5 },
  facebook: { maxChars: 5000, maxHashtags: 3 },
  tiktok: { maxChars: 2200, maxHashtags: 5 },
  linkedin: { maxChars: LINKEDIN_SAFE_MAX, maxHashtags: 5 },
};

export interface PlatformPost { text: string; hashtags: string[]; truncated: boolean; unsupportedClaims: string[] }
export type PlatformPosts = Partial<Record<SocialPlatformId | "linkedin", PlatformPost>>;

export function normalizeHashtags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const clean = t.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
    const key = clean.toLowerCase();
    if (clean && !seen.has(key)) { seen.add(key); out.push(clean); }
  }
  return out;
}

function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, Math.max(0, max - 1));
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd() + "…";
}

export function buildPlatformPost(platform: SocialPlatformId | "linkedin", baseText: string, hashtags: string[]): PlatformPost {
  const rules = COPY_RULES[platform];
  const tags = normalizeHashtags(hashtags).slice(0, rules.maxHashtags);
  let text = baseText.trim();
  let truncated = false;

  const compose = (t: string, tg: string[]) => (tg.length ? `${t}\n\n${tg.map((x) => `#${x}`).join(" ")}` : t);

  let kept = tags;
  while (compose(text, kept).length > rules.maxChars && kept.length) kept = kept.slice(0, -1);   // drop tags first
  if (compose(text, kept).length > rules.maxChars) {
    const room = rules.maxChars - (kept.length ? compose("", kept).length : 0);
    text = cutAtWord(text, room);
    truncated = true;
  }
  return { text, hashtags: kept, truncated, unsupportedClaims: findUnsupportedClaims(compose(text, kept)) };
}

export function buildSocialPosts(args: { caption: string; platformCaptions?: Partial<Record<SocialPlatformId, string | undefined>>; hashtags: string[] }): PlatformPosts {
  const out: PlatformPosts = {};
  for (const p of SOCIAL_PLATFORM_IDS) out[p] = buildPlatformPost(p, args.platformCaptions?.[p]?.trim() || args.caption, args.hashtags);
  return out;
}

export function buildLinkedInPost(args: { text: string; hashtags: string[] }): PlatformPosts {
  return { linkedin: buildPlatformPost("linkedin", args.text, args.hashtags) };
}

/** Every platform's FINAL text must be free of invented claims — the per-platform
 * captions are AI output too and previously went unchecked. */
export function copyErrors(posts: PlatformPosts): string[] {
  const errs: string[] = [];
  for (const [platform, post] of Object.entries(posts)) {
    if (!post) continue;
    if (!post.text.trim()) errs.push(`${platform}: caption is empty`);
    // A LinkedIn post cut mid-thought is worse than a regenerated one: flag it instead of publishing the cut.
    if (platform === "linkedin" && post.truncated) errs.push(`linkedin: text exceeded ${LINKEDIN_SAFE_MAX} characters and had to be cut`);
    if (post.unsupportedClaims.length) errs.push(`${platform}: unsupported claims (${post.unsupportedClaims.join(", ")})`);
  }
  return errs;
}
