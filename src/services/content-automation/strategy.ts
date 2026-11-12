import { z } from "zod";
import { findUnsupportedClaims } from "./claims";

/**
 * The creative-strategy layer of the social / LinkedIn agents: the shared tag
 * vocabulary (a Kangrooo-safe subset of docs/prodo-creative-knowledge.md §13),
 * the event-type → persona/desire starting points, the structured video shot and
 * the code that turns it into the Seedance prompt, plus the deterministic checks
 * that back up the prompt rules (no testimonials, no risky camera moves, no hook
 * repeats). Pure — no I/O.
 *
 * Only proof-free options exist here: Kangrooo has no reviews, offers, prices or
 * credentials in its data, so frameworks/levers that need proof (witness, spark,
 * social_proof, scarcity, risk_reversal …) are deliberately not in the enums.
 */

// ---- vocabulary --------------------------------------------------------------

export const DESIRES = ["health", "attraction", "status", "belonging", "control", "comfort"] as const;
export const AWARENESS_LEVELS = ["unaware", "problem_aware", "solution_aware", "product_aware", "most_aware"] as const;
export const OBJECTIVES = ["awareness", "converting", "retargeting"] as const;

export const SOCIAL_FRAMEWORKS = ["educator", "countdown", "cliffhanger", "shortcut", "bridge", "raw_take", "pas", "bab", "aida"] as const;
export const LINKEDIN_FRAMEWORKS = ["educator", "countdown", "shortcut", "bridge", "pas", "bab", "aida"] as const;

export const SOCIAL_HOOK_TYPES = ["question", "pov", "number_list", "teach", "callout", "result_first", "pattern_interrupt", "mistake"] as const;
export const LINKEDIN_HOOK_TYPES = ["question", "teach", "number_list", "callout", "mistake"] as const;

export const LEVERS = ["curiosity_gap", "intensification", "identity", "liking", "unity", "reciprocity", "loss_aversion", "concentration"] as const;

/**
 * Moves that stay inside what the reference photos show. Pull-outs, cranes, drones,
 * orbits, whip pans and fly-throughs reveal space nobody has seen — for a listing
 * that is an invented feature, so they are not offered at all.
 */
export const SAFE_CAMERA_MOVES = [
  "static", "pan", "tilt", "dolly_in", "slow_zoom", "slider", "truck", "pedestal",
  "push_past", "arc", "handheld", "low_to_high", "side_tracking", "reverse_tracking", "top_down",
] as const;

export const PEOPLE_MODES = ["none", "background_guests"] as const;
export type PeopleMode = (typeof PEOPLE_MODES)[number];

/** The model writes "Problem aware", "dolly-in" etc.; normalise before the enum check. */
const tag = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase().replace(/[\s-]+/g, "_") : v), z.enum(values));

// ---- event type → persona / desire ---------------------------------------------

interface PersonaHint { persona: string; desire: (typeof DESIRES)[number] }

/** Starting points only (keyed by lowercase keyword in the event type); the agent may choose another desire if the photos clearly fit it better. */
const PERSONA_HINTS: [RegExp, PersonaHint][] = [
  [/birthday/, { persona: "someone planning a birthday for themselves or a loved one", desire: "belonging" }],
  [/graduation/, { persona: "a family or grad celebrating a milestone", desire: "belonging" }],
  [/wedding|engagement|baby shower|private celebration|fundraiser/, { persona: "a host bringing family and friends together for a personal occasion", desire: "belonging" }],
  [/networking|mixer/, { persona: "a community organiser or professional hosting a networking night", desire: "status" }],
  [/team building/, { persona: "a team lead or office manager planning a team day", desire: "belonging" }],
  [/corporate event|conference|seminar/, { persona: "a company event planner who has to make a good impression", desire: "status" }],
  [/meeting|presentation|interview|pitch|startup|business workshop/, { persona: "a professional who needs a credible, distraction-free room", desire: "control" }],
  [/workshop/, { persona: "an instructor or facilitator running a hands-on session", desire: "control" }],
  [/photo|video|content|podcast|audio|voice/, { persona: "a creator or small production team that needs a ready-to-shoot space", desire: "control" }],
  [/activation|pop-up|pop up|launch/, { persona: "a brand or small business staging a launch or pop-up", desire: "status" }],
];

export function personaOptions(eventTypes: string[]): { eventType: string; persona: string; desire: string }[] {
  const out: { eventType: string; persona: string; desire: string }[] = [];
  for (const eventType of eventTypes) {
    const hit = PERSONA_HINTS.find(([re]) => re.test(eventType.toLowerCase()));
    if (hit) out.push({ eventType, ...hit[1] });
  }
  return out;
}

// ---- strategy schema -------------------------------------------------------------

function makeStrategySchema<F extends readonly [string, ...string[]], H extends readonly [string, ...string[]]>(frameworks: F, hookTypes: H) {
  const hookType = tag(hookTypes);
  return z.object({
    event_type: z.string().trim().min(2),
    persona: z.string().trim().min(3),
    desire: tag(DESIRES),
    awareness_level: tag(AWARENESS_LEVELS),
    objective: tag(OBJECTIVES),
    angle: z.string().trim().min(5),
    framework: tag(frameworks),
    levers: z.array(tag(LEVERS)).min(1).max(3),
    hook_candidates: z.array(z.object({
      hook_type: hookType,
      line: z.string().trim().min(3),
      score: z.coerce.number().min(1).max(5),
    })).min(3).max(8),
    hook: z.object({
      hook_type: hookType,
      visual: z.string().trim().default(""),
      line: z.string().trim().min(3).max(140),
    }),
    payoff: z.string().trim().min(5),
  }).superRefine((s, ctx) => {
    if (new Set(s.hook_candidates.map((h) => h.hook_type)).size < 2) ctx.addIssue({ code: "custom", message: "hook_candidates must cover at least 2 different hook types" });
    const words = s.hook.line.split(/\s+/).filter(Boolean).length;
    if (words > 15) ctx.addIssue({ code: "custom", message: "the chosen hook line must be 15 words or fewer" });
    for (const [where, text] of [["hook", s.hook.line], ["payoff", s.payoff]] as const) {
      const bad = [...findUnsupportedClaims(text)];
      if (bad.length) ctx.addIssue({ code: "custom", message: `${where} contains unsupported claims (${bad.join(", ")})` });
    }
  });
}

export const socialStrategySchema = makeStrategySchema(SOCIAL_FRAMEWORKS, SOCIAL_HOOK_TYPES);
export const linkedinStrategySchema = makeStrategySchema(LINKEDIN_FRAMEWORKS, LINKEDIN_HOOK_TYPES);
export type CreativeStrategy = z.infer<typeof socialStrategySchema>;

export const peopleSchema = tag(PEOPLE_MODES).default("none");

// ---- video shot ---------------------------------------------------------------------

/**
 * Every video is a NARRATED promo (product decision): one off-screen narrator, generated by
 * Seedance's native audio, describes the space and promotes booking it — over music, with no
 * other voices. Paced to sound unhurried: ~2 words/s over ~28 s (2026-11-12: a 69-word script at
 * 2.3 words/s, each line pinned to its shot, came out rushed and mechanical).
 */
export const VIDEO_MIN_NARRATION_WORDS = 45;
export const VIDEO_MAX_NARRATION_WORDS = 60;

/** Sound descriptions that would bring other voices into the mix (only the narrator speaks). */
const VOICE_SOUND = /\b(chatter|chatting|conversations?|voices?|talking|talk|dialogue|crowd|murmur(ing)?|laugh(s|ter|ing)?|cheer(s|ing)?|applause|sing(s|ing)?|vocals?|speech|toasts?)\b/i;
/** Beat actions that put speech on screen or make a person the subject. */
const ON_SCREEN_SPEECH = /\b(speaks?|speaking|says|saying|talks?|talking|chat(s|ting)?|conversations?|discuss(es|ing)?|address(es|ing)|giv(es|ing) a (speech|toast|talk)|toast(s|ing)?|presents? to|presenting|sings?|singing|interview(s|ing)?)\b/i;
const PEOPLE_AS_SUBJECT = /\b(zoom(s|ing)?|push(es|ing)?|dolly(ing)?|move(s|ing)?) (in )?(on|onto|towards?) (a |an |the |two |three |some )?(small )?(guests?|people|person|group|man|woman|couple|attendees|presenter|speaker|host)\b|\bclose-?ups? (of|on) (a |an |the )?(guests?|people|person|faces?|group|man|woman|couple|presenter|speaker|host)\b/i;

const NO_NARRATION = /^(null|none|n\/a|no narration|-)?$/i;

// ---- the narrator's voice ------------------------------------------------------------

/**
 * The narrator's voice, chosen by the agent from the mood of its own script (product decision:
 * a normal, assured voice for corporate/professional spaces, a friendly one when the mood is light).
 */
export const VOICE_MOODS = ["professional", "friendly", "calm", "lively"] as const;
export type VoiceMood = (typeof VOICE_MOODS)[number];

/**
 * How each mood is described to Seedance: a concrete person in a concrete situation, recorded a concrete
 * way — never adjectives about "a voice" or the word "announcer". A described situation ("showing a client
 * around") carries rhythm and intonation that a list of qualities doesn't.
 */
export const VOICE_DIRECTION: Record<VoiceMood, string> = {
  professional: "a Canadian host in their thirties walking a client through the room on a private viewing — calm, assured and warm, plain-spoken, relaxed even pace, recorded close on a good microphone in a quiet room",
  friendly: "a Canadian host in their thirties showing a friend around a place they like — easy and warm, a smile you can hear, relaxed pace, recorded close on a good microphone in a quiet room, like a well-made voice note",
  calm: "a soft-spoken Canadian host in their thirties, close to the microphone in a quiet room — slow, gentle and intimate, leaving room to breathe between sentences",
  lively: "an upbeat Canadian host in their twenties telling a friend about a great party spot — bright and a little quicker, a grin in their voice, still conversational, recorded close on a good microphone",
};

/**
 * Said for every voice: positive delivery cues only. A list of negatives ("never robotic, flat…") was tried
 * and still produced a mechanical read (2026-11-12) — it names the very qualities it forbids.
 */
export const NATURAL_DELIVERY =
  "Delivery: one continuous, unhurried take at about two words per second, the way people talk when they're showing someone around — pauses at the full stops and commas, small natural rises and falls in pitch, a little emphasis on the words that matter, a quiet breath before a new sentence, and a softer, slower last line.";

const voiceSchema = z.preprocess(
  (v) => (typeof v === "string" ? { mood: v } : v),   // the agent sometimes sends just the mood
  z.object({
    mood: tag(VOICE_MOODS),
    /** Optional note on how to say it, e.g. "a smile on the hook, slower on the final invite". */
    delivery: z.string().trim().max(200).default(""),
  }),
);

/**
 * Style examples shown to the writers (planning agent and narration rewrite). They show the
 * register only — seen in a dry run: the agent copied a strong example word for word, so code
 * rejects narration that reuses any 5 consecutive words of the strong ones.
 */
// About an imaginary pottery studio on purpose: when the examples described things real listings
// have (a long table, wall art), the agent pasted them into those listings' videos.
export const NARRATION_STYLE_EXAMPLES = {
  weak: "Rows of pottery wheels are arranged beneath skylights, ready for creativity. A brick kiln adds a rustic touch to the inspiring atmosphere.",
  professional: "Your team gets a wheel each, right under the skylights. And the brick kiln at the back? That's where the afternoon's work ends up.",
  friendly: "Grab a wheel under the skylights and get your hands muddy. That brick kiln? It's where your wonky bowls go to become real.",
  /** A whole 30 s voice-over (49 words) — shows the arc: an opener a person would say, a walk-through, what it's for, a short invite. */
  full: "Okay, so this is where your team's afternoon gets messy — in a good way. Everyone gets their own wheel, right under the skylights. Shelves of glaze along the back, all yours to play with. And when you're done, that brick kiln does the rest. Find it on Kangrooo.",
};
const wordsOf = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter(Boolean);
const EXAMPLE_SHINGLES = new Set(
  [NARRATION_STYLE_EXAMPLES.professional, NARRATION_STYLE_EXAMPLES.friendly, NARRATION_STYLE_EXAMPLES.full].flatMap((t) => {
    const w = wordsOf(t);
    return w.slice(0, -4).map((_, i) => w.slice(i, i + 5).join(" "));
  }),
);
/** The first 5-word run the narration copies from a style example, or null. */
export function copiedExample(narration: string): string | null {
  const w = wordsOf(narration);
  for (let i = 0; i + 5 <= w.length; i++) { const s = w.slice(i, i + 5).join(" "); if (EXAMPLE_SHINGLES.has(s)) return s; }
  return null;
}

/** People-made sound named in the narration; Seedance may voice it (seen in a dry run: "friends laughing", "Cheers to good times!"). */
const NARRATED_SOUNDS = /\b(laugh(s|ing|ter)?|cheer(s|ing)?|chatter|chatting|singing|sing-?along|applause|clapping|shouting|toasts?|toasting)\b/i;

/** Listing-description phrasing that makes a voice-over sound read out (seen in dry runs: "boasts", "featuring"). */
const BROCHURE = /\b(boasts?|boasting|nestled|adorned|featur(es|ing) (a|an|the)|equipped with|offers (a|an)|amenities|state[- ]of[- ]the[- ]art|whether you'?re|look no further|an array of|plethora|exquisite|impeccabl[ey]|adds? an? [\w\s,-]{0,25}\btouch|casts? an? [\w\s,-]{0,20}\bglow)\b/i;

// ---- concrete space details (what the photos show) ---------------------------------

/** Words that describe without naming anything — a "detail" made only of these is not concrete. */
const GENERIC_WORDS = new Set([
  "space", "spaces", "room", "rooms", "area", "areas", "venue", "studio", "place", "setup", "setting", "settings", "decor", "design", "style",
  "modern", "elegant", "beautiful", "stylish", "vibrant", "lively", "great", "perfect", "nice", "lovely", "stunning", "amazing", "spacious",
  "bright", "cozy", "cosy", "warm", "inviting", "welcoming", "unique", "versatile", "customizable", "customisable", "ambient", "ambiance",
  "ambience", "atmosphere", "vibe", "feel", "look", "touch", "touches", "detail", "details", "with", "and", "the", "for", "from", "that", "this",
  "event", "events", "party", "parties", "celebration", "celebrations", "guests", "people", "lighting", "light", "lights", "large", "small", "open",
]);

/** The distinctive words of a detail ("gold chiavari chairs" → gold, chiavari, chairs), compared by a 5-letter stem. */
function detailStems(detail: string): string[] {
  return detail.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/)
    .filter((w) => w.length >= 3 && !GENERIC_WORDS.has(w)).map((w) => w.slice(0, 5));
}

/** Details from `details` that the narration actually names (any distinctive word of the detail appears). */
export function namedDetails(narration: string, details: string[]): string[] {
  const words = new Set(narration.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter((w) => w.length >= 3).map((w) => w.slice(0, 5)));
  return details.filter((d) => detailStems(d).some((st) => words.has(st)));
}

export const MIN_NAMED_DETAILS = 3;

/**
 * Filler that names nothing and sounds read out (seen in the 2026-11-12 dry run: "edgy vibe", "sleek wooden
 * bar", "lighting ensures focus", "wall art inspires creativity", "productive discussions", "make it your own").
 * Checked on the hook and the voice-over; NARRATION_FILLER_EXAMPLES is what the prompts show.
 */
export const NARRATION_FILLER = /\b(vibes?|vibey|sleek|edgy|ensures?|ensuring|inspires?|inspiring|ideal (for|spot|place|choice|setting|space)|productive|productivity|party time|make it (your|yours)( own)?|transform(s|ed|ing)?|seamless(ly)?|curated|versatile|elegant|stylish|chic)\b/i;
/**
 * Caption formats and announcer openers said aloud (seen 2026-11-12: the narrator opened with "POV: Your voice
 * unleashed…" because the spoken line had to repeat the caption hook word for word).
 */
export const CAPTION_SPEAK = /\b(pov|imagine|picture this|welcome to)\b/i;
/** Camera and editing words in the voice-over (seen 2026-11-12: "Zoom out, see it all."). */
export const CAMERA_TALK = /\b(zoom(s|ed|ing)?|pan(s|ned|ning)?|dolly|tilt(s|ed|ing)?|camera|footage|close-?ups?)\b/i;
export const NARRATION_FILLER_EXAMPLES = "vibe, sleek, edgy, ensures, inspires, ideal for, productive, party time, make it your own, transform, seamless, curated, versatile, elegant, stylish, chic";

/** Hype that promises without naming anything (seen live: "Imagine a birthday party where every detail shines"). */
const GENERIC_HOOK = /\b(every detail|perfect(ly)?|unforgettable|memorable|elevate[sd]?|dreams?|dreamy|vibrant|stunning|amazing|incredible|ultimate|special|magic(al)?|look no further|like (this|no other)|of your dreams|next level|in style|shines?)\b/i;

/** Why a hook is too generic: it must name a concrete detail the photos show, and carry no hype words. */
export function hookProblems(hook: string, spaceDetails: string[]): string[] {
  const out: string[] = [];
  if (!namedDetails(hook, spaceDetails).length) out.push(`the hook "${hook}" must name at least one of your space_details — something real the viewer will see`);
  const hype = hook.match(GENERIC_HOOK) ?? hook.match(NARRATION_FILLER);
  if (hype) out.push(`the hook "${hook}" uses generic hype ("${hype[0]}") — be specific instead`);
  return out;
}

/** 4–8 concrete things the photos show — objects, materials, colours, fixtures — each naming something real. */
export const spaceDetailsSchema = z.array(z.string().trim().min(3)).min(4).max(8).superRefine((ds, ctx) => {
  for (const d of ds) if (!detailStems(d).length) ctx.addIssue({ code: "custom", message: `space detail "${d}" is not concrete — name a visible object, material, colour or fixture (e.g. "gold chiavari chairs", "LED-screen stage")` });
});

/**
 * Common names for allowed moves (seen live: the agent wrote moves outside the list and the whole
 * plan was re-asked). Banned reveal moves (orbit, crane, drone…) are deliberately NOT mapped.
 */
const MOVE_SYNONYMS: Record<string, (typeof SAFE_CAMERA_MOVES)[number]> = {
  zoom: "slow_zoom", zoom_in: "slow_zoom", slow_zoom_in: "slow_zoom", optical_zoom: "slow_zoom",
  dolly: "dolly_in", push_in: "dolly_in", slow_push_in: "dolly_in", slow_dolly_in: "dolly_in", dolly_forward: "dolly_in",
  track: "side_tracking", tracking: "side_tracking", tracking_shot: "side_tracking", lateral_tracking: "side_tracking",
  slide: "slider", sliding: "slider", slider_move: "slider",
  pan_left: "pan", pan_right: "pan", slow_pan: "pan", tilt_up: "tilt", tilt_down: "tilt", slow_tilt: "tilt",
  locked: "static", locked_off: "static", still: "static", hold: "static",
  overhead: "top_down", birds_eye: "top_down", bird_s_eye: "top_down",
  pedestal_up: "pedestal", pedestal_down: "pedestal", low_angle_reveal: "low_to_high",
};
function normalizeMove(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const k = v.trim().toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
  return MOVE_SYNONYMS[k] ?? k;
}

/** Silent mingling instead of talk (seen live: "chat" in a shot made the whole plan re-asked). Real speech (toast, speech, singing) still fails. */
function silenceAction(v: unknown): unknown {
  if (typeof v !== "string") return v;
  return v
    .replace(/\bin (animated |lively |quiet )?conversations?\b/gi, "mingling")
    .replace(/\b(chatting|talking|conversing|discussing)\b/gi, "mingling")
    .replace(/\b(chats?|talks?|converse)\b/gi, "mingle")
    .replace(/\b(animated |lively )?conversations?\b/gi, "mingling")
    // Audible crowd reactions would put voices under the narrator (seen live: "filled with laughter and joy").
    .replace(/\b(filled with|full of|echoes with|rings with) (laughter|cheers|cheering|applause)( and (joy|fun|smiles))?/gi, "lively")
    .replace(/\b(laughter|laughing|cheering|cheers|applause)\b/gi, "smiles");
}

const beatSchema = z.object({
  start_s: z.coerce.number().min(0),
  end_s: z.coerce.number().min(0),
  camera_move: z.preprocess(normalizeMove, z.enum(SAFE_CAMERA_MOVES)),
  camera_detail: z.string().trim().default(""),
  action: z.preprocess(silenceAction, z.string().trim().min(5)),
  /** Decided per shot by the agent from its script and direction: a clean shot of the space, or the space in use. */
  people: tag(PEOPLE_MODES).default("none"),
  /** The narration spoken DURING this shot. The full voice-over is these lines joined in order. */
  line: z.string().trim().default(""),
});

/** Unhurried speaking pace (≈2 words/s) — the writer's guide per shot; the per-shot cap adds slack because a sentence may run on into the next shot. */
export const NARRATION_WORDS_PER_SECOND = 2;
export const lineBudget = (seconds: number) => Math.max(4, Math.round(seconds * NARRATION_WORDS_PER_SECOND) + 4);
/** Extra words the first shot may carry so a concrete hook fits (≈1 s of speech). */
export const HOOK_SPILL_WORDS = 3;
/**
 * Every shot after the hook lasts 4–7 s, so a video has 5–6 shots. The model reliably writes ~10–13 words a
 * line whatever the shot length (2026-11-12 dry runs: ~18 attempts and rewrites, nearly all 9–13 words, on
 * 7–12 s shots); short shots make that natural length fill the shot instead of fighting it.
 */
export const SHOT_MIN_SECONDS = 4;
export const SHOT_MAX_SECONDS = 7;

/** The word count to aim for in a shot of this length. A guide for the writer, not enforced: the voice-over flows across shots. */
export const lineTarget = (seconds: number) => Math.max(4, Math.round(seconds * NARRATION_WORDS_PER_SECOND));
const countWords = (t: string) => t.split(/\s+/).filter(Boolean).length;

/** When every shot has its own line, the narration IS those lines in shot order (the model writes it per shot so the length and sync land). */
function joinShotLines(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as { beats?: unknown; narration?: unknown };
  if (!Array.isArray(r.beats)) return raw;
  const beats = r.beats as { start_s?: unknown; line?: unknown }[];
  if (!beats.length || !beats.every((b) => b && typeof b.line === "string" && b.line.trim())) return raw;
  const ordered = [...beats].sort((a, b) => Number(a.start_s) - Number(b.start_s));
  return { ...r, narration: ordered.map((b) => String(b.line).trim()).join(" ") };
}

const MENTIONS_PEOPLE = /\b(guests?|people|person|attendees|crowd|group|couple|man|woman|host|presenter|speaker)\b/i;

/** A video's overall people setting, derived from its shots: guests in any shot → "background_guests". */
export function shotPeople(shot: { beats: { people: PeopleMode }[] }): PeopleMode {
  return shot.beats.some((b) => b.people === "background_guests") ? "background_guests" : "none";
}

export const videoShotSchema = z.preprocess(joinShotLines, z.object({
  rig: z.string().trim().min(2),
  framing: z.string().trim().default(""),
  beats: z.array(beatSchema).min(3).max(6),
  subject: z.string().trim().min(3),
  environment: z.string().trim().min(3),
  light: z.string().trim().min(3),
  style: z.string().trim().min(3),
  sound: z.string().trim().min(3),
  // Required. Seen live: the model sent the STRING "null", which Seedance was then asked to voice.
  narration: z.preprocess((v) => (typeof v === "string" && NO_NARRATION.test(v.trim()) ? "" : v ?? ""), z.string().trim()),
  /** The narrator's voice, picked from the script's mood. */
  voice: voiceSchema,
}).superRefine((s, ctx) => {
  const beats = [...s.beats].sort((a, b) => a.start_s - b.start_s);
  if (beats[0].start_s !== 0) ctx.addIssue({ code: "custom", message: "the first beat must start at 0 s" });
  if (beats[0].end_s > 3) ctx.addIssue({ code: "custom", message: "the hook beat must end by 3 s (motion and a change inside the first 3 seconds)" });
  for (let i = 0; i < beats.length; i++) {
    if (beats[i].end_s <= beats[i].start_s) ctx.addIssue({ code: "custom", message: `beat ${i + 1} ends before it starts` });
    if (i > 0 && Math.abs(beats[i].start_s - beats[i - 1].end_s) > 0.5) ctx.addIssue({ code: "custom", message: `beat ${i + 1} must start where beat ${i} ends` });
    // Worded so it is NOT taken for a narration-only problem (NARRATION_PROBLEM): a line rewrite can't fix timing.
    const secs = beats[i].end_s - beats[i].start_s;
    if (i > 0 && (secs < SHOT_MIN_SECONDS - 0.05 || secs > SHOT_MAX_SECONDS + 0.05)) ctx.addIssue({ code: "custom", message: `beat ${i + 1} lasts ${secs} s — after the hook beat, each beat must last ${SHOT_MIN_SECONDS}–${SHOT_MAX_SECONDS} s (plan 5–6 beats in total)` });
  }
  if (Math.abs(beats[beats.length - 1].end_s - 30) > 1) ctx.addIssue({ code: "custom", message: "the last beat must end at 30 s" });
  const words = s.narration.split(/\s+/).filter(Boolean).length;
  if (words < VIDEO_MIN_NARRATION_WORDS || words > VIDEO_MAX_NARRATION_WORDS) {
    ctx.addIssue({ code: "custom", message: `narration must be ${VIDEO_MIN_NARRATION_WORDS}–${VIDEO_MAX_NARRATION_WORDS} words of voice-over that describes the space and promotes booking it (got ${words})` });
  }
  const bad = findUnsupportedClaims(s.narration);
  if (bad.length) ctx.addIssue({ code: "custom", message: `narration contains unsupported claims (${bad.join(", ")})` });
  const brochure = s.narration.match(BROCHURE);
  if (brochure) ctx.addIssue({ code: "custom", message: `the narration reads like a listing description ("${brochure[0]}") — write it the way a person talks: contractions, short sentences, everyday words` });
  const hype = s.narration.match(GENERIC_HOOK);
  if (hype) ctx.addIssue({ code: "custom", message: `the narration uses ad-speak ("${hype[0]}") — say what's actually there instead, the way a person would` });
  const caption = s.narration.match(CAPTION_SPEAK);
  if (caption) ctx.addIssue({ code: "custom", message: `the narration uses caption-speak ("${caption[0]}") — open the way a person actually starts talking: a question, a direct line to the viewer, or a plain observation` });
  const camera = s.narration.match(CAMERA_TALK);
  if (camera) ctx.addIssue({ code: "custom", message: `the narration talks about the camera ("${camera[0]}") — talk about the room and what the viewer would do there` });
  const filler = s.narration.match(NARRATION_FILLER);
  if (filler) ctx.addIssue({ code: "custom", message: `the narration uses filler ("${filler[0]}") — name what's on screen and what the viewer would do there instead` });
  const sounds = s.narration.match(NARRATED_SOUNDS);
  if (sounds) ctx.addIssue({ code: "custom", message: `the narration mentions people making sound ("${sounds[0]}") — the video model may add those voices; describe what the viewer sees, the narrator is the only voice` });
  const copied = copiedExample(s.narration);
  if (copied) ctx.addIssue({ code: "custom", message: `the narration copies the style example ("${copied}…") — write your own lines about this space` });
  if (VOICE_SOUND.test(s.sound)) ctx.addIssue({ code: "custom", message: `"sound" must be music and room tone only — the narrator is the only voice (remove: ${s.sound.match(VOICE_SOUND)![0]})` });
  for (const [i, b] of beats.entries()) {
    if (ON_SCREEN_SPEECH.test(b.action)) ctx.addIssue({ code: "custom", message: `beat ${i + 1}: nobody on screen speaks — remove "${b.action.match(ON_SCREEN_SPEECH)![0]}" (the narrator is the only voice)` });
    if (PEOPLE_AS_SUBJECT.test(`${b.action} ${b.camera_detail}`)) ctx.addIssue({ code: "custom", message: `beat ${i + 1}: the camera must stay on the space, not move in on people` });
    if (b.people === "none" && MENTIONS_PEOPLE.test(b.action)) ctx.addIssue({ code: "custom", message: `beat ${i + 1} is a clean shot ("people": "none") but its action mentions people — set "people": "background_guests" or describe the empty space` });
  }
  const withLines = beats.filter((b) => b.line);
  if (withLines.length && withLines.length < beats.length) ctx.addIssue({ code: "custom", message: "write a narration \"line\" for EVERY shot (or none)" });
  for (const [i, b] of beats.entries()) {
    if (!b.line) continue;
    // The opening shot carries the spoken hook, which has to name a real detail: it may run ~1 s into the next shot.
    const budget = lineBudget(b.end_s - b.start_s) + (i === 0 ? HOOK_SPILL_WORDS : 0);
    const n = countWords(b.line);
    if (n > budget) ctx.addIssue({ code: "custom", message: `beat ${i + 1}'s line is ${n} words for a ${b.end_s - b.start_s}-second shot — at most ${budget}` });
  }
  // Only what directs the camera and the scene — not the narration (seen in a dry run: "pull up a chair" read as a pull-up reveal).
  const risky = findRiskyCameraLanguage([s.rig, s.framing, s.subject, s.environment, ...beats.map((b) => `${MOVE_LABEL[b.camera_move]} ${b.camera_detail} ${b.action}`)].join("\n"));
  if (risky.length) ctx.addIssue({ code: "custom", message: `the shot reveals space the photos don't show (${risky.join(", ")}); keep the camera inside the photographed space` });
}));
export type VideoShot = z.infer<typeof videoShotSchema>;

const MOVE_LABEL: Record<(typeof SAFE_CAMERA_MOVES)[number], string> = {
  static: "locked-off static frame, no camera movement", pan: "slow pan", tilt: "slow tilt", dolly_in: "slow dolly in",
  slow_zoom: "slow optical zoom, camera fixed", slider: "slider move with foreground parallax", truck: "lateral truck",
  pedestal: "pedestal move", push_past: "push past a foreground element", arc: "quarter arc around the subject",
  handheld: "handheld, natural micro-movement", low_to_high: "low-to-high stabilised reveal", side_tracking: "side tracking",
  reverse_tracking: "reverse tracking", top_down: "top-down overhead",
};

/** People rule (product decision): AI people only as background guests who never speak. No AI-label flag. */
export function peopleRule(mode: PeopleMode): string {
  return mode === "background_guests"
    ? "People: the venue is the subject. Only a few background guests, small in frame and mid-activity (walking, setting a glass down, looking around the room), never in close-up, never the focus, never looking into the camera; mouths closed — nobody speaks, sings, lip-syncs or talks to anyone."
    : "People: no people in the scene.";
}

/** Assembles the Seedance prompt from the structured shot, camera first so the model locks the spatial plan (§8.2). */
export function buildVideoPrompt(s: Omit<VideoShot, "beats"> & { beats: z.infer<typeof beatSchema>[] }): string {
  const beats = [...s.beats].sort((a, b) => a.start_s - b.start_s);
  const people = shotPeople(s);
  const mixed = people === "background_guests" && beats.some((b) => b.people === "none");
  const voice = `${VOICE_DIRECTION[s.voice.mood]}${s.voice.delivery ? `; ${s.voice.delivery.replace(/[.;\s]+$/, "")}` : ""}`;
  // The voice-over is given ONCE, as one continuous take that loosely follows the shots. Pinning each line
  // to its shot's timestamps (tried until 2026-11-12) made the narrator start and stop on a schedule.
  const audio =
    `ONE off-screen narrator speaks this voice-over as a single continuous take, loosely following the shots in order, starting about half a second in and finishing by about 28 seconds: "${s.narration}" ` +
    `VOICE: ${voice}. ${NATURAL_DELIVERY} ` +
    `Under the voice: ${s.sound}, mixed low so the voice stays clear. The narrator is the only voice — nobody on screen speaks, and there is no other speech, singing or crowd sound.`;
  return [
    "Vertical 9:16 social video, 30 seconds, real time, normal speed, no slow motion.",
    `CAMERA: ${s.rig}${s.framing ? `; ${s.framing}` : ""}. Moving on frame one.`,
    "TIMELINE:",
    ...beats.map((b) => `${b.start_s}–${b.end_s} s — camera: ${MOVE_LABEL[b.camera_move]}${b.camera_detail ? ` (${b.camera_detail})` : ""}. Action: ${b.action}. People: ${b.people === "none" ? "none — a clean shot of the empty space" : "a few background guests, small in frame"}.`),
    `SUBJECT: ${s.subject}`,
    `ENVIRONMENT: ${s.environment}`,
    `LIGHT: ${s.light}; one consistent light direction and colour temperature throughout.`,
    `STYLE: ${s.style}, natural colour grade.`,
    `AUDIO: ${audio}`,
    peopleRule(people) + (mixed ? " Shots marked \"People: none\" show the space with nobody in it." : ""),
    "CONSTRAINTS: natural physics — gravity, weight, real contact, every motion has a visible cause; consistent furniture, layout and materials across the whole clip; no text, captions, titles, logos, watermarks or signage anywhere.",
  ].join("\n");
}

// ---- deterministic backstops -----------------------------------------------------

/** Camera language that reveals space beyond the reference photos (an invented feature for a listing). */
export function findRiskyCameraLanguage(text: string): string[] {
  const rules: [RegExp, string][] = [
    [/\b(drone|aerial)\b/i, "drone/aerial"],
    [/\bfly[- ]?through\b|\bfpv\b/i, "fly-through"],
    [/\b(pull|pulls|pulling|dolly|dollies|crane|cranes)\s+(back|out|up)\b/i, "pull-out reveal"],
    [/\b360\b|\bfull orbit\b|\borbits?\s+(around|the)\b/i, "full orbit"],
    [/\bwhip[- ]?pan\b/i, "whip pan"],
    [/\bbullet[- ]time\b/i, "bullet time"],
  ];
  return rules.filter(([re]) => re.test(text)).map(([, l]) => l);
}

const STOPWORDS = new Set(["the", "and", "for", "your", "you", "this", "that", "with", "are", "was", "but", "not", "have", "has", "just", "into", "from", "our", "its", "it's", "what", "when", "where", "who", "why", "how"]);

function contentWords(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w)));
}

/** Jaccard overlap of content words: a cheap, deterministic stand-in for embedding similarity. */
export function hookSimilarity(a: string, b: string): number {
  const A = contentWords(a), B = contentWords(b);
  if (!A.size || !B.size) return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

export const HOOK_REPEAT_THRESHOLD = 0.6;

/** The recent hook this line is too close to, if any. */
export function findRepeatedHook(line: string, recent: string[], threshold = HOOK_REPEAT_THRESHOLD): string | null {
  return recent.find((r) => hookSimilarity(line, r) >= threshold) ?? null;
}

// ---- weekly creative mix (Phase 4) -------------------------------------------------

/**
 * Rotation orders. The lengths are coprime (9 × 8 for social, 7 × 5 for LinkedIn),
 * so framework × hook-type combinations don't repeat until every pair has been used.
 */
const SOCIAL_FRAMEWORK_ROTATION = ["educator", "bab", "countdown", "cliffhanger", "shortcut", "pas", "raw_take", "bridge", "aida"] as const satisfies readonly (typeof SOCIAL_FRAMEWORKS)[number][];
const SOCIAL_HOOK_ROTATION = ["question", "pov", "number_list", "result_first", "teach", "callout", "pattern_interrupt", "mistake"] as const satisfies readonly (typeof SOCIAL_HOOK_TYPES)[number][];
const LINKEDIN_FRAMEWORK_ROTATION = ["educator", "bridge", "countdown", "pas", "shortcut", "bab", "aida"] as const satisfies readonly (typeof LINKEDIN_FRAMEWORKS)[number][];
const LINKEDIN_HOOK_ROTATION = ["teach", "question", "number_list", "mistake", "callout"] as const satisfies readonly (typeof LINKEDIN_HOOK_TYPES)[number][];
/** 7 awareness : 3 converting per 10 creatives — there are no offers to sell against, so most posts entertain or teach. */
const OBJECTIVE_PATTERN = ["awareness", "awareness", "converting", "awareness", "awareness", "converting", "awareness", "awareness", "converting", "awareness"] as const;

export interface SlotCreative { objective: (typeof OBJECTIVES)[number]; framework: string; hook_type: string; position: number }

/**
 * The creative mix for one queue slot, decided by code — not by the agent — so a
 * week is varied by construction and each creative tests a known combination.
 * `priorCount` is how many creatives of this pipeline the business had before the
 * cycle began, so the rotation continues across weeks instead of restarting.
 * Deterministic: jobs run in parallel and can't coordinate, but they don't need to —
 * consecutive slots always get a different framework and hook type.
 */
export function assignSlotCreative(pipeline: "social" | "linkedin", slotIndex: number, priorCount: number): SlotCreative {
  const position = Math.max(0, priorCount) + Math.max(1, slotIndex) - 1;
  const frameworks = pipeline === "social" ? SOCIAL_FRAMEWORK_ROTATION : LINKEDIN_FRAMEWORK_ROTATION;
  const hooks = pipeline === "social" ? SOCIAL_HOOK_ROTATION : LINKEDIN_HOOK_ROTATION;
  return {
    objective: OBJECTIVE_PATTERN[position % OBJECTIVE_PATTERN.length],
    framework: frameworks[position % frameworks.length],
    hook_type: hooks[position % hooks.length],
    position,
  };
}

/** How the agent's strategy deviates from the slot's assignment (empty when it follows it). */
export function assignmentMismatches(s: { objective: string; framework: string; hook: { hook_type: string } }, a: SlotCreative): string[] {
  const out: string[] = [];
  if (s.objective !== a.objective) out.push(`objective must be "${a.objective}" (you chose "${s.objective}")`);
  if (s.framework !== a.framework) out.push(`framework must be "${a.framework}" (you chose "${s.framework}")`);
  if (s.hook.hook_type !== a.hook_type) out.push(`the chosen hook must be a "${a.hook_type}" hook (you chose "${s.hook.hook_type}")`);
  return out;
}
