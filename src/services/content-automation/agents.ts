import { z } from "zod";
import { findUnsupportedClaims } from "./claims";
import { hookSchema } from "./image-text";
import { VIDEO_FORMAT, VIDEO_TOTAL_SECONDS } from "./video-spec";
import { MIN_NAMED_DETAILS, buildVideoPrompt, hookProblems, linkedinStrategySchema, namedDetails, peopleSchema, shotPeople, socialStrategySchema, spaceDetailsSchema, videoShotSchema } from "./strategy";

/**
 * Parsing + validation of the AI agents' JSON, and the deterministic checks
 * that stand between generated text and a "valid" revision. Pure functions.
 */

export function parseAgentJson(raw: string): unknown {
  const cleaned = raw.replace(/```json\s*|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI response contained no JSON object");
  return JSON.parse(cleaned.slice(start, end + 1));
}

const tags = z.array(z.string()).transform((a) =>
  a.map((t) => t.replace(/^#+/, "").replace(/\s+/g, "").trim()).filter(Boolean).slice(0, 12)
);

/** Invented claims in any of the agent's copy fail the PLAN — before any paid media is generated. */
function copyClaimIssues(fields: [string, string | undefined | null][]): string[] {
  const out: string[] = [];
  for (const [where, text] of fields) {
    const bad = text ? findUnsupportedClaims(text) : [];
    if (bad.length) out.push(`${where} contains unsupported claims (${bad.join(", ")})`);
  }
  return out;
}

/**
 * Free-text fields the model sometimes returns as a list (e.g. "script" as an array of
 * beats). The content is fine; only the shape differs — join it instead of rejecting the plan.
 */
const looseText = z.preprocess((v) => {
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? Object.values(x).join(" — ") : String(x))).join("\n");
  if (v && typeof v === "object") return Object.values(v).join(" — ");
  return v ?? "";
}, z.string());

export const socialAgentSchema = z.object({
  content_type: z.enum(["image", "video"]),
  reason: looseText.default(""),
  concept: looseText.default(""),
  script: looseText.default(""),
  strategy: socialStrategySchema,
  /** What the agent can SEE in the listing photos — the narration has to name these, not generic praise. */
  space_details: spaceDetailsSchema,
  people: peopleSchema,
  caption: z.string().min(1),
  platform_captions: z.object({
    instagram: z.string().optional(), facebook: z.string().optional(), tiktok: z.string().optional(),
  }).partial().default({}),
  hashtags: tags.default([]),
  image: z.object({ visual_prompt: z.string().min(10) }).nullable().default(null),
  video: z.object({
    format_reason: looseText.default(""),
    shot: videoShotSchema,
  }).nullable().default(null),
}).superRefine((v, ctx) => {
  if (v.content_type === "image" && !v.image) ctx.addIssue({ code: "custom", message: "image content needs an image prompt" });
  if (v.content_type === "video" && !v.video) ctx.addIssue({ code: "custom", message: "video content needs a video shot" });
  for (const message of hookProblems(v.strategy.hook.line, v.space_details)) ctx.addIssue({ code: "custom", message });
  if (v.video) {
    // The caption opens with the written hook; the narrator opens with a SPOKEN line of its own (written by
    // the narration writer). Requiring the hook word for word put caption-speak in the voice-over (2026-11-12:
    // "POV: Your voice unleashed…"), so only the hook's idea carries over — the critic judges the payoff.
    const named = namedDetails(v.video.shot.narration, v.space_details);
    if (named.length < MIN_NAMED_DETAILS) {
      ctx.addIssue({ code: "custom", message: `the narration must name at least ${MIN_NAMED_DETAILS} of your space_details (it names ${named.length}: ${named.join(", ") || "none"}) — describe what the photos actually show, not generic praise` });
    }
  }
  for (const message of copyClaimIssues([
    ["caption", v.caption], ["instagram caption", v.platform_captions.instagram], ["facebook caption", v.platform_captions.facebook],
    ["tiktok caption", v.platform_captions.tiktok], ["hashtags", v.hashtags.join(" ")],
  ])) ctx.addIssue({ code: "custom", message });
}).transform((v) => v.video
  // Product rule: every video is exactly ONE 30 s clip. Code — not the model — assembles
  // the Seedance prompt from the structured shot, so the camera-first order, the physics
  // constraints, the people rule and "no on-screen text" are always present.
  ? {
      ...v,
      // For a video the agent decides people PER SHOT; the overall setting follows from the shots.
      people: shotPeople(v.video.shot),
      video: {
        format: VIDEO_FORMAT, format_reason: v.video.format_reason, shot: v.video.shot,
        clips: [{ duration_seconds: VIDEO_TOTAL_SECONDS, prompt: buildVideoPrompt(v.video.shot) }],
      },
    }
  : { ...v, video: null });
export type SocialAgentOutput = z.infer<typeof socialAgentSchema>;

export const linkedinAgentSchema = z.object({
  theme: looseText.default(""),
  reason: looseText.default(""),
  strategy: linkedinStrategySchema,
  people: peopleSchema,
  post_text: z.string().min(20),
  hashtags: tags.default([]),
  image: z.object({ visual_prompt: z.string().min(10), hook: hookSchema }),
}).superRefine((v, ctx) => {
  for (const message of copyClaimIssues([["post text", v.post_text], ["hashtags", v.hashtags.join(" ")]])) ctx.addIssue({ code: "custom", message });
});
export type LinkedInAgentOutput = z.infer<typeof linkedinAgentSchema>;

export { findUnsupportedClaims };

export interface RevisionCheck { ok: boolean; errors: string[] }

export function validateRevisionContent(input: {
  contentType: "image" | "video" | "text_image";
  caption: string | null;
  hashtags: string[];
  hasMedia: boolean;
  videoFormat?: "single_clip" | null;
  clipDurations?: number[];
  completedClips?: number;
}): RevisionCheck {
  const errors: string[] = [];
  if (!input.caption || !input.caption.trim()) errors.push("caption is empty");
  if (!input.hasMedia) errors.push("final media is missing");
  const claims = findUnsupportedClaims(`${input.caption ?? ""} ${input.hashtags.join(" ")}`);
  if (claims.length) errors.push(`unsupported claims in text: ${claims.join(", ")}`);
  if (input.contentType === "video") {
    if (input.videoFormat !== VIDEO_FORMAT) errors.push("video format missing");
    if ((input.completedClips ?? 0) !== 1) errors.push(`expected 1 completed clip, have ${input.completedClips ?? 0}`);
    const durs = input.clipDurations ?? [];
    if (durs.length !== 1 || Math.abs(durs[0] - VIDEO_TOTAL_SECONDS) > 1) errors.push(`the video must be one ${VIDEO_TOTAL_SECONDS} s clip`);
  }
  if (input.contentType === "text_image" && (input.caption?.length ?? 0) < 20) errors.push("LinkedIn text is too short");
  return { ok: errors.length === 0, errors };
}
