/**
 * Social Media content-generation prompts. Ported from the legacy n8n
 * workflows (`Social media Images posts.json`, `Social media
 * video creation.json`) which were proven to generate good results —
 * genericized to read business persona from the `businesses` row instead
 * of being hardcoded to one client, and with the platform-caption
 * character-budget logic ported as a deterministic function instead of
 * being duplicated across multiple prompt call sites (it was copy-pasted
 * across 3 different n8n Code nodes in the legacy system).
 */

export type SocialPlatform = "facebook" | "instagram" | "youtube" | "x" | "linkedin" | "tiktok";

export function businessContextBlock(business: any): string {
  const name = business?.name || "the business";
  const industry = business?.industry || "this industry";
  const offerings = business?.core_offerings || "Not specified";
  const audience = business?.target_audience || "Not specified";
  const voice = business?.business_voice || "Professional, trustworthy, and clear";
  const painPoints = business?.pain_points || "Not specified";

  return `YOUR BUSINESS: ${String(name).toUpperCase()}
- Industry: ${industry}
- Core offerings: ${offerings}
- Target audience: ${audience}
- Customer pain points: ${painPoints}
- Brand voice: ${voice}`;
}

// ============================================================
// Caption / metadata generation — ported near-verbatim from the legacy
// caption agent, which was reused unchanged for both image and video
// posts. Produces one canonical {title, post, tags, caption} object;
// `formatPlatformCaptions` below then derives each platform's variant.
// ============================================================

export interface CaptionPromptInput {
  ideaPrompt: string;
  contentType: "image" | "video" | "text";
  language?: string;
}

export function getSocialCaptionPrompt(business: any, input: CaptionPromptInput) {
  const businessName = business?.name || "the business";
  const hashtag = `#${String(businessName).replace(/[^a-zA-Z0-9]/g, "")}`;
  const language = input.language && input.language !== "English" ? input.language : null;

  const system = `${language ? `OUTPUT LANGUAGE: Write the title, post, and caption ENTIRELY in ${language} — not other language, not mixed. Keep the hashtags in TAGS RULES in their normal Latin/English form (standard practice for discoverability even on non-English posts).\n\n` : ""}You are a social media content strategist for ${businessName}, a ${business?.industry || "business"} serving ${business?.target_audience || "its customers"}.

${businessContextBlock(business)}

Your task is to analyze the input content idea and generate optimized social media metadata.

Before generating content, silently analyze: the specific offering or topic mentioned in the input, the emotional tone, the main transformation or benefit, the most suitable post angle, and the target audience.

POST ANGLE OPTIONS — choose ONE naturally based on the input:
Personal transformation, quality of life improvement, discovery moment, life after the experience, specialist care and trust, wellness and prevention, behind the scenes, customer story, myth-busting, educational tip.

TITLE RULES
- Maximum 60 characters
- Use 1-2 emojis
- Create curiosity, emotion, or inspiration
- Vary format between transformation / question / discovery / emotional / bold statement — avoid repetitive structures

POST RULES
- Length between 150 and 200 characters
- Compress the situation, the value, and the outcome into one concise story
- Emotional and human, never jargon-heavy
- No pricing, no invented statistics
- End with a call-to-action equivalent to "Visit ${businessName} to learn more."${language ? ` — written naturally in ${language}, not left in English` : ""}

CAPTION RULES
- 150 to 300 characters
- Strong emotional opening
- One key insight
- 3-4 short benefit points using emojis
- End with an engagement question
- Warm, human, social-media-native tone

TAGS RULES
- 8-12 hashtags
- Include topic-specific tags relevant to this input
- Include tags relevant to ${business?.industry || "this industry"}
- Always include ${hashtag}
- Use searchable CamelCase hashtags, no spaces

QUALITY RULES
- Professional but human-sounding, never robotic
- Suitable for Facebook, Instagram, LinkedIn, and TikTok
- No exaggerated claims, no invented pricing or percentages
- Never fabricate specifics not present in the business context or input above

OUTPUT FORMAT
Return ONLY valid JSON. No markdown, no backticks, no commentary.
{
  "title": "Generated title (max 60 chars, 1-2 emojis)",
  "post": "Generated post (150-200 chars, ends with the required CTA)",
  "tags": "#Tag1 #Tag2 #Tag3 ...",
  "caption": "Generated caption (150-300 chars, ends with an engagement question)"
}`;

  const user = `CONTENT TYPE: ${input.contentType}
IDEA: ${input.ideaPrompt}

Generate the metadata as instructed. Return ONLY the JSON object.`;

  return { system, user };
}

export interface CaptionMetadata {
  title: string;
  post: string;
  tags: string;
  caption: string;
}

export interface PlatformCaption {
  text: string;
  title?: string;
}

/**
 * Deterministic per-platform formatter — ported verbatim from the legacy
 * "Platform-Wise Content Formatter" Code node (duplicated 3x in the n8n
 * workflows; centralized here as one function instead). Each platform
 * gets a different mix of {title, post, caption, tags} and a hard
 * character budget matched to what actually performs well there, not
 * necessarily the platform's technical max length.
 */
export function formatPlatformCaptions(meta: CaptionMetadata, platforms: SocialPlatform[]): Partial<Record<SocialPlatform, PlatformCaption>> {
  const tagList = meta.tags.split(/\s+/).filter(Boolean);
  const result: Partial<Record<SocialPlatform, PlatformCaption>> = {};

  const appendTagsWithinBudget = (base: string, budget: number): string => {
    let text = base;
    for (const tag of tagList) {
      const candidate = `${text} ${tag}`;
      if (candidate.length > budget) break;
      text = candidate;
    }
    return text;
  };

  for (const platform of platforms) {
    switch (platform) {
      case "facebook":
        result.facebook = { text: `${meta.post}\n\n${tagList.slice(0, 5).join(" ")}` };
        break;
      case "instagram":
        result.instagram = { text: `${meta.caption}\n.\n.\n.\n${tagList.join(" ")}` };
        break;
      case "linkedin":
        result.linkedin = { text: `${meta.post}\n\n${tagList.slice(0, 7).join(" ")}` };
        break;
      case "tiktok":
        result.tiktok = { text: appendTagsWithinBudget(meta.caption.slice(0, 85), 85) };
        break;
      case "x":
        result.x = { text: appendTagsWithinBudget(meta.caption.slice(0, 150), 150) };
        break;
      case "youtube":
        result.youtube = { title: meta.title, text: `${meta.post}\n\n${meta.tags}` };
        break;
    }
  }

  return result;
}

// ============================================================
// Idea generation — expands a short user-typed idea into 3 angle
// variations, the same "Generate Ideas" pattern already proven in
// CreateAdModal (`idea-generation.prompt.ts`), adapted for organic social
// content: a content idea/description, not a finished ad-story script.
// ============================================================

export interface SocialIdeaPromptInput {
  format: "image" | "video" | "text";
  ideaPrompt: string;
  service?: string;
}

export function getSocialIdeaPrompt(business: any, input: SocialIdeaPromptInput) {
  const businessName = business?.name || "the business";

  const system = `You are a social media content strategist for ${businessName}, a ${business?.industry || "business"}.

${businessContextBlock(business)}
${input.service ? `\nTHIS IDEA IS SPECIFICALLY FOR: ${input.service}. All 3 variations must be about this service — never blend in another.\n` : ""}
YOUR JOB
Take the short user input describing a topic, offer, or moment, then expand it into 3 emotionally distinct variations of the same idea — each a content description for one ${input.format} post (not a finished caption, just what the post should show and be about).

THREE ANGLES (one per idea)
1. ANGLE "transformation": lead with the before/after change.
2. ANGLE "moment": lead with one specific, sensory scene or moment worth sharing.
3. ANGLE "trust": lead with why ${businessName} specifically — expertise, care, credibility.

STYLE RULES
- 2-4 sentences per idea, describing what the post should depict/say — never a hashtag list or finished caption.
- Warm, human, concrete — never vague marketing language.
- Never use jargon, never promise specific outcomes, never name competitors.
- No emojis, no hashtags, no markdown.

OUTPUT FORMAT
Return ONLY valid JSON. No markdown fences. No commentary.
{
  "ideas": [
    { "id": 1, "angle": "transformation", "idea": "<2-4 sentences>" },
    { "id": 2, "angle": "moment", "idea": "<2-4 sentences>" },
    { "id": 3, "angle": "trust", "idea": "<2-4 sentences>" }
  ]
}`;

  const user = `INPUT
{
  "format": "${input.format}",
  "idea": "${input.ideaPrompt}"
}

Generate exactly 3 idea variations as instructed. Return ONLY the JSON object.`;

  return { system, user };
}

// ============================================================
// Caption improve — rewrites one already-written, platform-specific
// caption on request (from the Publish flow's editable preview), instead
// of generating a fresh one from scratch.
// ============================================================

export interface ImproveCaptionInput {
  platform: SocialPlatform;
  caption: string;
  instruction?: string;
}

const PLATFORM_TONE: Record<SocialPlatform, string> = {
  facebook: "warm and conversational, can run a bit longer",
  instagram: "visual-first, casual, hashtag-friendly",
  linkedin: "professional but still human, no corporate jargon",
  tiktok: "short, punchy, hooks fast, under 85 characters",
  x: "punchy and concise, under 150 characters",
  youtube: "a clear descriptive title-style line",
};

export function getImproveCaptionPrompt(business: any, input: ImproveCaptionInput) {
  const businessName = business?.name || "the business";

  const system = `You are a social media copy editor for ${businessName}, a ${business?.industry || "business"}.

${businessContextBlock(business)}

YOUR JOB
Rewrite the given ${input.platform} caption to be more engaging, ${input.instruction ? `following this specific instruction: "${input.instruction}"` : "improving clarity, hook strength, and tone"} — while keeping the same core message and any facts present.

STYLE FOR THIS PLATFORM: ${PLATFORM_TONE[input.platform]}

HARD RULES
- Never invent facts, numbers, or claims not already implied by the original caption.
- Keep whatever hashtags were present, unless the instruction says otherwise.
- No markdown, no commentary, no quotes around the output.
- Output ONLY the rewritten caption text, nothing else.`;

  const user = `ORIGINAL CAPTION:\n${input.caption}\n\nRewrite it as instructed. Output only the new caption text.`;

  return { system, user };
}
