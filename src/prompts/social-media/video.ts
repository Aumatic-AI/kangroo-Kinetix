import { serviceDescriptor } from "../meta-ads/shared";
import { sceneCountForDuration, maxSceneCountForDuration, AD_MODE_STRUCTURES } from "../meta-ads/video";
import { businessContextBlock } from "./index";

/** Video post generation — the story ARC is a fixed, hardcoded shape again
 * (problem -> discovers the business -> books the space/service ->
 * resolved and happy), reusing the proven TRANSFORMATION act structure
 * from Meta Ads' video prompt (`AD_MODE_STRUCTURES.TRANSFORMATION` in
 * `meta-ads/video.ts`) rather than duplicating that prose here. This is a
 * deliberate partial revert of the earlier "pick 1 of 8 modes" genericization
 * — explicitly requested: every organic social video should follow this
 * same beat structure, but WHAT the problem is, WHERE it happens, and what
 * the surrounding environment/scene looks like must stay entirely dynamic,
 * driven by the idea + business context, never hardcoded. So: the ARC is
 * fixed, the SITUATION is not. `ad_mode` is hardcoded to "TRANSFORMATION" in
 * code (see generateSocialVideoScript), not asked of the model, since it's
 * no longer a choice — that value still flows into the shared
 * `getVisualPromptsPrompt` (`meta-ads/video.ts`) exactly like before, so the
 * before/after visual-tier system and phase-based mood still apply
 * correctly. `visual_mood` stays a genuine per-idea choice — only the
 * narrative arc was asked to be hardcoded back, not the visual style. */
export interface SocialVideoScriptInput {
  ideaPrompt: string;
  duration: number; // seconds
  character: "male" | "female";
  service?: string;
  language?: string;
}

export function getSocialVideoScriptPrompt(business: any, input: SocialVideoScriptInput): string {
  const businessName = business?.name || "the business";
  const minSceneCount = sceneCountForDuration(input.duration);
  const maxSceneCount = maxSceneCountForDuration(input.duration);
  const characterName = input.character === "male" ? "James" : "Sarah";
  const descriptor = serviceDescriptor(business, input.service);
  const language = input.language && input.language !== "English" ? input.language : null;

  return `${language ? `OUTPUT LANGUAGE: Write the ENTIRE script in ${language}. Every single line must be in ${language}, not English. Do not mix languages.\n\n` : ""}You are an expert short-form social video scriptwriter for ${businessName}, a ${business?.industry || "business"}.

${businessContextBlock(business)}

You write AUDIO ONLY — spoken narration read aloud by ElevenLabs TTS. No camera directions, no on-screen text, just the words the voice will say. This is organic social content, not a paid ad — favor a natural, unhurried, native-to-the-feed voice over a hard sales pitch.

STORY IDEA
${input.ideaPrompt}
${descriptor ? `THIS POST IS SPECIFICALLY FOR: ${descriptor}. Every claim must be about this service — never blend in another.\n` : ""}

Convert the idea above into a polished voiceover script with a clean arc and TTS-friendly rhythm, following this ACT STRUCTURE exactly:

${AD_MODE_STRUCTURES.TRANSFORMATION}

The ACT STRUCTURE above is fixed — every script follows this same shape. What is NOT fixed: the specific problem, the setting, the environment, or how any of it looks — all of that comes entirely from the idea and business context below, never assumed or defaulted to a particular scenario. The same person could plausibly have this exact problem in any number of real situations; don't narrow it to one just because it's a common example.

Before writing Act 1, silently work out: what specific real-world condition or dissatisfaction is this idea actually about${descriptor ? ` — this is for "${descriptor}", so ground your answer in what that service actually treats` : ""}? Then write 2-3 concrete, natural ways a real person would describe that exact condition (specific and sensory, never a vague "something is wrong"). Use that grounding for every relevant line below.

ASSIGN ONE NAME, use it throughout — use "${characterName}" (or another common name matching the ${input.character} character) in line 1 at minimum. PRONOUN IS NOT A FREE CHOICE: the character is ${input.character}, so every other line uses ${input.character === "male" ? `"he"/"him"/"his" — NEVER "she"/"her" anywhere in the script` : `"she"/"her"/"hers" — NEVER "he"/"him" anywhere in the script`}. This matters beyond the words themselves — the video's visuals are generated separately and will show a ${input.character} person, so a mismatched pronoun in the audio makes the finished video look wrong even though each half was made correctly on its own. Check every single line before returning; one wrong pronoun anywhere is a failure.

LENGTH — ${minSceneCount} SCENES IS THE FLOOR, NOT AN EXACT TARGET: each script line becomes one video scene downstream. The script array MUST have AT LEAST ${minSceneCount} lines (matching the requested duration) — but if the story above is rich enough that telling it properly, without rushing a beat or cutting the ending short, genuinely needs more room, use more lines, up to ${maxSceneCount}. Never fewer than ${minSceneCount}, never more than ${maxSceneCount}. A complete, well-paced story that runs a bit longer than the requested duration is always better than a rushed or truncated one that hits the number exactly — don't pad a simple idea with filler lines just to reach the max, either; use exactly as many as this specific story earns.
Each line = ONE complete sentence, 6-9 words. Hard cap at 10 words — this is what actually keeps each scene's spoken audio comfortably short, not the total line count.

HARD RULES
- Mention "${businessName}" by name AT MOST ONCE across the whole script, at the point where it's most natural (Act 2, the discovery).
- Never use jargon or technical/clinical language.
- Never use em dashes, semicolons, quotation marks, parentheses, asterisks, hashes, emojis, or ALL CAPS.
- One sentence per line, plain conversational ${language || "English"}.
- Avoid tongue-twisters, clusters of similar consonant sounds, and rare or hard-to-pronounce words — prefer short, common, everyday words a voice actor could read smoothly in one breath. This is spoken narration, so clarity of delivery matters as much as meaning.

HARD CONSTRAINT — NEVER PULL A PRICE, DISCOUNT, PERCENTAGE, OR DATE FROM BUSINESS CONTEXT ON YOUR OWN
State a specific price, percentage, discount, or date ONLY if the idea/brief above itself explicitly mentions one. Never take a number or date like that from the business context section on your own initiative just because it happens to appear there, and never invent one either — if the business context mentions a discount, price, or date but the idea doesn't ask for one, leave it out of the script entirely.

IF THIS BUSINESS'S OWN INDUSTRY/OFFERINGS ABOVE ARE HEALTH, MEDICAL, OR COSMETIC
Also forbid:
1. Surgical, procedural, or recovery descriptions
2. Pain, blood, needles, instruments, side effects, risks
3. Medical jargon (e.g. alopecia, malocclusion, obesity, rhinophyma) — describe things the way a real person would, not a clinician
4. Time markers (three weeks later, six months on, before, after, suddenly)
For any other kind of business, this section does not apply.

OUTPUT FORMAT — STRICT
Return ONLY valid JSON. No markdown fences. No commentary.
{
  "visual_mood": "one of: CLEAN_PRECISE | WARM_APPROACHABLE | PREMIUM_CONSIDERED | BOLD_ENERGETIC | PLAYFUL",
  "script": [
    "Line one.",
    "Line two."
  ]
}
Rules:
- "visual_mood" is the ONE visual archetype that best matches this business's own voice/description above — pick deliberately, never the same one every time just because it's safe.
- "script" must be a JSON array of between ${minSceneCount} and ${maxSceneCount} strings (inclusive), one sentence per element, in order — see LENGTH above for how to choose the actual count.
- No extra fields, no trailing commas.`;
}
