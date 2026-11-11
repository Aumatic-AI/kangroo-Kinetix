import { z } from "zod";
import { findUnsupportedClaims } from "./claims";

/**
 * The text hook rendered ON a LinkedIn image by the image model, and the check that
 * makes sure it came out spelled exactly right. Image models do misspell, so a
 * headline is never accepted on the model's say-so: a vision model transcribes what
 * is actually on the image (letter by letter) and it must match the intended text
 * exactly, with nothing else written anywhere. Pure functions — no I/O.
 */

/** Plain, easy-to-render, professional: letters and basic punctuation only. */
const HEADLINE_CHARS = /^[A-Za-z][A-Za-z '’,.?!-]*$/;

export const hookSchema = z.object({
  headline: z.string().trim()
    .min(8, "hook headline is too short").max(40, "hook headline must be at most 40 characters")
    .regex(HEADLINE_CHARS, "hook headline may only use letters and basic punctuation (no numbers, emoji or symbols)"),
}).superRefine((v, ctx) => {
  const words = v.headline.split(/\s+/).filter(Boolean).length;
  if (words < 2 || words > 6) ctx.addIssue({ code: "custom", message: "hook headline must be 2–6 words" });
  const claims = findUnsupportedClaims(v.headline);
  if (claims.length) ctx.addIssue({ code: "custom", message: `hook headline contains unsupported claims (${claims.join(", ")})` });
});
export type Hook = z.infer<typeof hookSchema>;

/** Lowercase letters/digits only, so case, spacing and punctuation never decide a match. */
export function normalizeText(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

export const LINKEDIN_TEXT_IMAGE_SUFFIX = (headline: string) =>
  ` Base the scene on the provided reference photos of the real venue and stay faithful to them. Professional editorial photograph, square 1:1.` +
  ` Render exactly ONE line of text on the image and nothing else written anywhere: "${headline}".` +
  ` Spell it exactly as given, letter for letter, keeping the capitalization and punctuation as written.` +
  ` Bold, clean, modern sans-serif, white, large and easy to read, placed in the lower third over a soft dark gradient for contrast, inside generous margins.` +
  ` No other text, no logos, no watermarks, no signage, no prices, no invented features.`;

export const TEXT_CHECK_SYSTEM = `You are a meticulous proofreader reading text that appears inside an image. Transcribe ONLY what is literally visible, exactly as rendered — do NOT correct spelling, do NOT guess what the text was meant to say. If a word is misspelled in the image, report the misspelling. Respond with a single valid JSON object only.`;

export const TEXT_CHECK_PROMPT = `List every piece of text visible anywhere in this image (headlines, captions, signs, logos, watermarks, small print). For each, give the text as written and then spell it letter by letter exactly as rendered, separated by hyphens.
Return JSON exactly: { "texts": [ { "text": "...", "letters": "H-e-l-l-o" } ] }
If there is no text at all, return { "texts": [] }.`;

export interface TextRead { text: string; letters: string }

export function parseTextRead(raw: string): TextRead[] {
  const cleaned = raw.replace(/```json\s*|```/g, "").trim();
  const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("the proofreading response contained no JSON");
  const data = JSON.parse(cleaned.slice(start, end + 1)) as { texts?: unknown };
  if (!Array.isArray(data.texts)) throw new Error("the proofreading response had no texts list");
  return data.texts.map((t) => {
    const o = (t ?? {}) as { text?: unknown; letters?: unknown };
    return { text: typeof o.text === "string" ? o.text : "", letters: typeof o.letters === "string" ? o.letters : "" };
  }).filter((t) => t.text.trim() || t.letters.trim());
}

export interface TextVerdict { ok: boolean; errors: string[] }

/**
 * The image must carry exactly the intended headline: one text element whose
 * transcription AND letter-by-letter spelling both equal it, and no other text.
 */
export function verifyRenderedText(expected: string, reads: TextRead[]): TextVerdict {
  const want = normalizeText(expected);
  if (!want) return { ok: false, errors: ["no expected headline to verify against"] };
  if (reads.length === 0) return { ok: false, errors: ["no text was rendered on the image"] };
  if (reads.length > 1) return { ok: false, errors: [`the image carries extra text: ${reads.map((r) => `"${r.text}"`).join(", ")}`] };
  const [r] = reads;
  const asText = normalizeText(r.text);
  const asLetters = normalizeText(r.letters.split(/[-\s]+/).join(""));
  const errors: string[] = [];
  if (asText !== want) errors.push(`rendered "${r.text}" instead of "${expected}"`);
  if (asLetters !== want) errors.push(`letter-by-letter reading "${r.letters}" does not match "${expected}"`);
  return { ok: errors.length === 0, errors };
}
