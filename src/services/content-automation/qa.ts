import { z } from "zod";
import { namedDetails } from "./strategy";

/**
 * The two QA gates of the social/LinkedIn pipeline (docs/prodo-creative-knowledge.md
 * §10, adapted to Kangrooo). Pure — the AI calls live in generate-creative.ts and
 * the prompts in src/prompts/content-automation.
 *
 * Gate 1 reviews the PLAN (with the listing photos) before any paid media is made.
 * Gate 2 reviews the MEDIA that was produced against the listing photos.
 *
 * The model reports scores and issues; code decides pass/fail from them, so a
 * critic can never pass a plan by just saying "passed: true".
 */

// ---- Gate 1: brief review ----------------------------------------------------------

export const BRIEF_DIMENSIONS = {
  strategic_fit: { weight: 0.15, label: "Strategic fit" },
  hook_strength: { weight: 0.20, label: "Hook strength" },
  single_message: { weight: 0.10, label: "Single clear message" },
  persuasion_craft: { weight: 0.15, label: "Persuasion craft" },
  faithfulness: { weight: 0.15, label: "Faithfulness to the listing" },
  persona_fit: { weight: 0.10, label: "Persona and voice fit" },
  producibility: { weight: 0.10, label: "Producibility" },
  brand: { weight: 0.05, label: "Brand" },
} as const;
export type BriefDimension = keyof typeof BRIEF_DIMENSIONS;
const DIMENSION_KEYS = Object.keys(BRIEF_DIMENSIONS) as [BriefDimension, ...BriefDimension[]];

export const BRIEF_PASS_SCORE = 7;
/** Revisions the agent gets after a failed review (so at most 3 reviews per creative). */
export const MAX_BRIEF_REVISIONS = 2;

export const AUTO_FAIL_CODES = [
  "invented_feature",      // describes a room, fixture, view or amenity the photos/facts don't support
  "unsupported_claim",     // price, capacity, size, rating, award, availability…
  "testimonial",           // anyone presenting an experience at the venue as their own
  "fake_urgency",
  "two_desires",
  "hook_not_paid_off",
  "in_scene_text",         // asks the image/video model to render words, logos or signage (LinkedIn's headline excepted)
  "speaking_person",       // an on-screen person speaks, sings, lip-syncs or addresses the camera
  "prohibited_content",
  "real_person_or_brand",
] as const;
export type AutoFailCode = (typeof AUTO_FAIL_CODES)[number];

const score = z.coerce.number().min(0).max(10);
const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase().replace(/[\s-]+/g, "_") : v);

/** The only kinds of thing that count as an invented VENUE feature (the critic must name one). */
export const INVENTED_CATEGORIES = ["room", "view_or_window", "fixture", "built_in_furniture", "equipment", "amenity", "exterior", "layout"] as const;

/**
 * Elements that are never an invented venue feature, whatever the critic says: props guests
 * bring, people and what they do, mood, light and plain adjectives. Seen live: gpt-4o
 * auto-failed "balloons", "a toast", "a spacious room", "a vibrant room filled with people"
 * and "ambient lighting and elegant decor" as invented features.
 */
const SOFT_ELEMENT = /\b(balloons?|decor(ations?)?|centerpieces?|flowers?|cake|food|snacks?|drinks?|glasses|wine glass(es)?|toast(ing)?|laptops?|notebooks?|business cards?|guests?|people|attendees|crowd|presenter|speaker|conversations?|chat(ting)?|networking|laughter|handshakes?|atmosphere|ambien(ce|t)|vibe|mood|energy|lively|vibrant|elegant|sophisticated|stylish|spacious|bright|cosy|cozy|warm|modern|light(ing)?|sunlight|glow|shadows?)\b/i;

const rawAutoFail = z.object({
  code: z.preprocess(norm, z.string()),
  element: z.string().trim().default(""),
  category: z.preprocess(norm, z.string()).default(""),
  reason: z.string().trim().default(""),
});

const NEGATION = /\b(not|no|isn'?t|aren'?t|doesn'?t|don'?t|absent|unsupported|missing|cannot|can'?t|unclear)\b/i;

export const briefReviewSchema = z.object({
  /** The critic's own photo check of the agent's space_details: which numbered photo shows each (null = none). */
  detail_checks: z.array(z.object({ detail: z.string().trim().min(1), photo: z.coerce.number().int().nullable().catch(null) })).default([]),
  scores: z.object(Object.fromEntries(DIMENSION_KEYS.map((k) => [k, score])) as Record<BriefDimension, typeof score>),
  auto_fails: z.array(rawAutoFail).default([]),
  issues: z.array(z.object({
    dimension: z.string().trim().default(""),
    problem: z.string().trim().min(1),
    fix: z.string().trim().default(""),
  })).default([]),
}).transform((r) => {
  // Code decides which auto-fails stand. Unknown codes and unexplained ones are ignored;
  // an "invented feature" must name a concrete venue element of a listed category and not
  // be a prop, a person, a mood or an adjective — otherwise it becomes a faithfulness issue
  // (still fed back to the agent) instead of blocking the plan.
  const kept: { code: AutoFailCode; reason: string }[] = [];
  const demoted: { dimension: string; problem: string; fix: string }[] = [];
  for (const f of r.auto_fails) {
    if (!(AUTO_FAIL_CODES as readonly string[]).includes(f.code) || !f.reason) continue;
    if (f.code === "invented_feature") {
      const subject = f.element || f.reason;
      const concrete = (INVENTED_CATEGORIES as readonly string[]).includes(f.category) && !SOFT_ELEMENT.test(subject);
      if (!concrete) { demoted.push({ dimension: "faithfulness", problem: f.reason, fix: "Keep it consistent with what the photos show." }); continue; }
    }
    kept.push({ code: f.code as AutoFailCode, reason: f.element ? `${f.element}: ${f.reason}` : f.reason });
  }

  // Seen live (twice): the critic said Aviva's LED-screen stage "is not visible in the photos"
  // while photos 1 and 2 show it. Its own per-photo check overrules it: a complaint that a
  // VERIFIED detail is missing is dropped, and an unverified detail becomes a real issue.
  const verified = r.detail_checks.filter((d) => d.photo !== null && d.photo >= 1).map((d) => d.detail);
  const unverified = r.detail_checks.filter((d) => d.photo === null).map((d) => d.detail);
  const contradicted = (text: string) => NEGATION.test(text) && namedDetails(text, verified).length > 0;
  const issues = [...r.issues, ...demoted];
  const keptIssues = issues.filter((i) => !contradicted(i.problem));
  const keptFails = kept.filter((f) => f.code !== "invented_feature" || !contradicted(f.reason));
  const overruled = [
    ...issues.filter((i) => contradicted(i.problem)).map((i) => i.problem),
    ...kept.filter((f) => !keptFails.includes(f)).map((f) => f.reason),
  ];
  for (const d of unverified) keptIssues.push({ dimension: "faithfulness", problem: `"${d}" is not visible in any of the photos`, fix: "Only name and show what the photos show." });
  const scores = { ...r.scores };
  // A faithfulness score lowered only by complaints that were overruled is restored.
  if (overruled.length && !keptIssues.some((i) => i.dimension === "faithfulness") && !keptFails.some((f) => f.code === "invented_feature")) {
    scores.faithfulness = Math.max(scores.faithfulness, 8);
  }
  return { scores, auto_fails: keptFails, issues: keptIssues, overruled, verified_details: verified, unverified_details: unverified };
});
export type BriefReviewRaw = z.infer<typeof briefReviewSchema>;

export interface BriefReview {
  passed: boolean;
  score: number;
  scores: Record<BriefDimension, number>;
  autoFails: { code: AutoFailCode; reason: string }[];
  issues: { dimension: string; problem: string; fix: string }[];
  /** Critic complaints its own photo check contradicted (dropped). */
  overruled: string[];
  verifiedDetails: string[];
  unverifiedDetails: string[];
}

export function scoreBrief(raw: BriefReviewRaw): BriefReview {
  let total = 0;
  for (const k of DIMENSION_KEYS) total += raw.scores[k] * BRIEF_DIMENSIONS[k].weight;
  const rounded = Math.round(total * 10) / 10;
  return {
    passed: rounded >= BRIEF_PASS_SCORE && raw.auto_fails.length === 0,
    score: rounded,
    scores: raw.scores,
    autoFails: raw.auto_fails,
    issues: raw.issues,
    overruled: raw.overruled,
    verifiedDetails: raw.verified_details,
    unverifiedDetails: raw.unverified_details,
  };
}

/** What the agent is told after a failed review: every auto-fail, then the issues with their fixes. */
export function briefFeedback(r: BriefReview): string {
  const lines = [
    `the creative review scored ${r.score}/10 (pass is ${BRIEF_PASS_SCORE}${r.autoFails.length ? " with no automatic fails" : ""}).`,
    ...r.autoFails.map((f) => `AUTOMATIC FAIL (${f.code.replace(/_/g, " ")}): ${f.reason}`),
    ...r.issues.slice(0, 8).map((i) => `${i.dimension ? `[${i.dimension}] ` : ""}${i.problem}${i.fix ? ` → fix: ${i.fix}` : ""}`),
  ];
  return lines.join("\n");
}

// ---- Gate 2: media review -----------------------------------------------------------

export const mediaReviewSchema = z.object({
  invented_features: z.array(z.string().trim().min(1)).default([]),
  issues: z.array(z.object({
    severity: z.preprocess(norm, z.enum(["blocker", "major", "minor"])),
    problem: z.string().trim().min(1),
    fix: z.string().trim().default(""),
  })).default([]),
});
export type MediaReviewRaw = z.infer<typeof mediaReviewSchema>;

export interface MediaReview {
  /** "skipped": not checked by design (rendered videos are never reviewed or rejected). */
  status: "passed" | "failed" | "unavailable" | "skipped";
  blockers: string[];
  warnings: string[];
  fix: string | null;
  reason?: string;          // why it was unavailable
}

/** Blockers: any invented feature, and any issue the reviewer marked "blocker". Majors/minors are recorded, not enforced. */
export function decideMediaReview(raw: MediaReviewRaw): MediaReview {
  const blockers = [
    ...raw.invented_features.map((f) => `invented feature: ${f}`),
    ...raw.issues.filter((i) => i.severity === "blocker").map((i) => i.problem),
  ];
  const warnings = raw.issues.filter((i) => i.severity !== "blocker").map((i) => `${i.severity}: ${i.problem}`);
  const fixes = raw.issues.filter((i) => i.severity === "blocker" && i.fix).map((i) => i.fix);
  return {
    status: blockers.length ? "failed" : "passed",
    blockers, warnings,
    fix: blockers.length ? [...blockers.map((b) => `Avoid: ${b}.`), ...fixes].join(" ") : null,
  };
}

export const mediaReviewUnavailable = (reason: string): MediaReview =>
  ({ status: "unavailable", blockers: [], warnings: [`media check could not run: ${reason}`], fix: null, reason });

/** One media re-render after a failed Gate 2, as a new revision. */
export const MAX_MEDIA_ATTEMPTS = 2;
