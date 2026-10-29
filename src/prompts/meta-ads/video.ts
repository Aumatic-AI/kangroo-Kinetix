import { serviceDescriptor, businessContextBlock } from "./shared";

/** Each script line becomes one video scene, so the number of scenes is
 * what actually determines the final stitched video's length. Accepts
 * either a plain number of seconds (Social's `duration`) or a dropdown
 * string like "40 seconds" (Meta Ads' `duration`). This is the FLOOR on
 * scene count, not an exact target — see maxSceneCountForDuration below. */
export function sceneCountForDuration(duration: string | number | undefined): number {
  const seconds = typeof duration === "number" ? duration : parseInt(String(duration || "").match(/\d+/)?.[0] || "28", 10);
  return Math.max(4, Math.round(seconds / 4));
}

/** Upper bound on scene count when the actual story needs more room than
 * the selected duration implies. The selected duration is a floor, not a
 * ceiling — a script that would otherwise have to skip a beat or rush the
 * ending to fit an exact scene count is worse than a slightly longer video,
 * so the model is allowed to use more scenes for a genuinely rich idea.
 * Capped (not unbounded) purely as a cost/time safety net: each extra scene
 * is a real image + video + narration generation, not a free line of text. */
export function maxSceneCountForDuration(duration: string | number | undefined): number {
  return Math.min(sceneCountForDuration(duration) + 4, 12);
}

/** The 8 narrative shapes a video ad can take. Fixed-but-rich on purpose —
 * NOT a free-form "invent any structure," because each mode needs its own
 * tailored act-by-act writing guidance to keep output quality high; an
 * unbounded, model-invented structure has no such scaffold. The model
 * picks exactly ONE per video, based on the idea + business context —
 * never defaulted to TRANSFORMATION just because that's the original
 * use case this was built for. */
export const AD_MODES = `- TRANSFORMATION: a specific, singular person's before/after journey — genuine personal transformation stories only. Use this when the idea describes or clearly implies ONE identifiable person's situation (even if unnamed — "someone who...", "you feel..."), not when it describes a pattern across many people.
- PROMOTION_OFFER: a sale, discount, or limited-time deal — the offer itself is the point.
- SERVICE_SPOTLIGHT: introduces and explains one specific service or offering.
- BRAND_INTRO: general awareness — who this business is, what makes it different, an invitation to visit.
- TESTIMONIAL_PROOF: leans on real social proof (reviews, ratings, outcomes people report) rather than one personal journey. STRONG SIGNAL for this mode over TRANSFORMATION: the idea itself uses aggregate/plural phrasing — "customers keep telling us...", "people say...", "our customers report..." — describing a pattern many people share, not one person's specific story. If the idea sounds like that, pick this mode, not TRANSFORMATION, even though TRANSFORMATION has the more detailed structure below.
- EDUCATIONAL_AUTHORITY: teaches or corrects a common question/misconception, building trust through expertise.
- ANNOUNCEMENT: introduces something genuinely new (a new service, location, product, or feature).
- EVENT_SEASONAL: tied to a specific time-bound occasion — a season, holiday, or limited dates.`;

/** Per-mode 3-act writing guidance. Every mode keeps the same proven shape
 * (hook first, three beats, one throughline) — only WHAT each beat covers
 * changes per mode, never the underlying discipline that keeps a script
 * tight and scroll-stopping. */
export const AD_MODE_STRUCTURES: Record<string, string> = {
  TRANSFORMATION: `ACT 1 — PROBLEM (hook + escalation). Line 1 is the HOOK — the first 2 seconds decide if the listener stays. Each line must combine: character name + emotional state word, the SPECIFIC problem, and a recognisable everyday moment.
  The moment comes from the idea/brief above FIRST, always — if it already describes or clearly implies a specific situation, setting, or moment, use exactly that, don't substitute a different one you invented. Only when the idea genuinely doesn't specify one do you invent a fitting moment yourself — and even then it can be absolutely anything a real person's life actually touches (home, family, a relationship, a hobby, exercise, travel, a birthday plan, a quiet moment completely alone, or, yes, sometimes work): never assume or default to any one of these just because it's common or was used last time, and vary your choice across different scripts rather than settling on the same reliable one repeatedly. In short: follow the idea's own specifics when it has them; only fall back to inventing (with real variety, not a default) when it doesn't.
  Format: "[Name] feels [emotion] about [problem] when [moment]." or "[Name] hides [problem] every time [moment]."
  GOOD (format example only — invent your own moment, don't reuse this one): "Priya feels stressed every time her team squeezes into a noisy, cramped meeting room."
  BAD: "Priya has a space problem." (vague) / "Priya thinks about finding somewhere better." (no emotional pain)
ACT 2 — THE BUSINESS'S JOURNEY. Narrate the calm, supported path using only these safe verbs: discovers, lands, meets, listens, examines, explains, plans, guides, supports, reassures. Pick beats to fill your line budget, in order: Decision (discovers the business and books a consultation) -> First contact (arrival or first real interaction with the team) -> Expert (meets the specialist who listens and plans the path) -> Confidence (feels safe and understood). Tone: warm, reassuring, calm.
ACT 3 — NEW STATE (payoff). Narrate the change as LIVED MOMENTS with WITNESSES who notice — never as a tagline. Second-to-last line: a first confident behaviour in daily life. Final line: the strongest emotional payoff, through one concrete moment — mirror whatever kind of moment Act 1 actually used (a birthday, a photo, and a family are just two examples below, not the default; the payoff moment should feel like it belongs to the same specific life Act 1 already set up, not a generic one bolted on).
  STRONG FINAL LINES (illustrating the FEELING to hit, not the specific moment to copy): "James laughs open-mouthed at his daughter's birthday and his family freezes in surprise." / "Sarah steps into the family photo without hesitation for the first time in years."
  Never end with a CTA, a slogan, a price, or a website — the transformation must speak for itself.`,
  PROMOTION_OFFER: `ACT 1 — THE OFFER, STATED PLAINLY. Line 1 is the HOOK — lead with the specific deal itself (only real figures/dates present in the business context or brief — never invent one). No vague teasing ("something special is coming") — say what it actually is, in the idea's own words wherever it already describes the offer.
ACT 2 — WHY IT'S GENUINELY GOOD. Explain what's included and remove hesitation (e.g. no strings attached, easy to claim, real value) — concrete, not generic hype, and still about this specific offer from the idea, not a generic list of unrelated services.
ACT 3 — URGENCY + CTA. State the real time/quantity constraint if one exists in the brief, then a direct spoken call to action. Unlike other modes, ending on a clear CTA/price mention here is correct, not a mistake — that's the whole point of a promotional ad.`,
  SERVICE_SPOTLIGHT: `ACT 1 — THE NEED. Hook on the specific question or need this service answers — concrete and relatable, not a category label, and in the idea's own framing if it already poses one.
ACT 2 — WHAT IT ACTUALLY IS. Plainly explain what the service does or involves, in everyday words a non-expert would use — no jargon, and staying on the specific need Act 1 named, not a generic services list.
ACT 3 — REASSURANCE + CTA. Why this is a safe, easy choice (credibility, ease, support), then an inviting call to action.`,
  BRAND_INTRO: `ACT 1 — WHO WE ARE, IN ONE LINE. Hook on a single sentence that captures what this business is about or stands for — using the idea's own specific angle, image, or phrasing if it has one, never a generic tagline that ignores it.
ACT 2 — WHY TRUST US. Warm, plain-language beats on values, what's different, real credibility or achievements — grounded in the business's own context, never invented, but still clearly connected to the idea's own angle from Act 1, not a disconnected list of services or offers that could belong to any ad for this business.
ACT 3 — INVITATION. A warm, open invitation to visit or learn more — no hard sell, phrased so it still echoes the idea's own angle rather than a generic sign-off.`,
  TESTIMONIAL_PROOF: `ACT 1 — THE PROOF, UP FRONT. Hook on a real, specific piece of social proof from the business context (a rating, a real outcome pattern) — if no real figure exists, hook on a plain "people genuinely love this" framing instead; never invent a number. If the idea itself already describes the specific thing people say or experience, hook on exactly that.
ACT 2 — WHAT PEOPLE SAY. The essence of real, generalized customer sentiment in plain words — never a fabricated quote attributed to a specific named person unless real data supports it, and staying on the specific pattern the idea described, not a generic list of services.
ACT 3 — WHY IT MATTERS + CTA. Tie the proof back to what the viewer can expect for themselves, then invite action.`,
  EDUCATIONAL_AUTHORITY: `ACT 1 — THE QUESTION. Hook on a common question or misconception, stated the way a real person would actually ask or think it — use the idea's own specific question/misconception if it already states one.
ACT 2 — THE ANSWER. Teach or correct it simply and usefully, in the business's own voice — genuinely informative, not a disguised pitch, and staying on the exact question Act 1 raised.
ACT 3 — WHY THIS BUSINESS + CTA. Connect the expertise just shown back to this business's own credibility, then an inviting call to action.`,
  ANNOUNCEMENT: `ACT 1 — SOMETHING NEW. Hook by naming what's new (a service, location, product, or feature) plainly and with genuine energy — in the idea's own words for it wherever it already names one.
ACT 2 — WHAT IT MEANS FOR THEM. Explain why this new thing actually matters to the viewer specifically, not just that it exists, staying on the specific thing Act 1 named.
ACT 3 — CTA. Invite them to be among the first to try or see it.`,
  EVENT_SEASONAL: `ACT 1 — THE OCCASION. Hook by naming the specific season, holiday, or date window this ad is tied to, in the idea's own words if it already names one.
ACT 2 — WHAT'S HAPPENING. What's on offer around this occasion — real details only, from the business context or brief, staying on the specific occasion Act 1 named.
ACT 3 — URGENCY + CTA. The real date window, then an inviting call to action before it ends.`,
};

/** Modes that center one person's story and benefit from a consistently
 * named protagonist. Everything else may be written in second person or
 * about the business itself, with no named individual required. Exported
 * so generate-video-ad.ts can skip resolving a reference-photo face-lock
 * entirely for modes that don't center one person — that lock should
 * never be forced onto every video regardless of what the ad is about. */
export const MODES_WITH_PROTAGONIST = new Set(["TRANSFORMATION", "PROMOTION_OFFER", "TESTIMONIAL_PROOF"]);

/** Cinematic color-grade phrase per brand archetype (the script-generation
 * call picks one of these as `visual_mood`, the same way it picks
 * `ad_mode`) — shared by the Meta Ads and Social video jobs so a fixed
 * "event venue, golden 3200K" style sentence never goes out for every
 * video regardless of business or story. */
export const MOOD_CINEMATOGRAPHY: Record<string, string> = {
  CLEAN_PRECISE: "a cool, crisp color grade with minimal contrast and clean, evidence-led lighting",
  WARM_APPROACHABLE: "a warm, soft color grade with gentle, reassuring natural light",
  PREMIUM_CONSIDERED: "a rich but restrained color grade, deep warm tones, unhurried and deliberate lighting",
  BOLD_ENERGETIC: "a high-contrast, saturated color grade with confident, dynamic lighting",
  PLAYFUL: "a bright, light color grade with a little unexpected energy",
};

export function getVideoAdScriptPrompt(intelligence: any, creative: any): string {
  const business = intelligence.business || {};

  const businessName = business.name || "the business";
  const descriptor = serviceDescriptor(business, creative.service);
  const language = creative.language && creative.language !== "English" ? creative.language : null;
  const minSceneCount = sceneCountForDuration(creative.duration);
  const maxSceneCount = maxSceneCountForDuration(creative.duration);

  return `${language ? `OUTPUT LANGUAGE: Write the ENTIRE script in ${language}. Every single line must be in ${language}, not English. Do not mix languages.\n\n` : ""}Generate the voiceover script from this input. Return only the JSON object — no other text.

Input:
{
  "duration": "${creative.duration || "28 seconds"}",
  "audioStyle": "${creative.audioStyle || "Voiceover"}",
  "videoStyle": "${creative.videoStyle || "Cinematic"}",
  "idea": "${creative.ideaPrompt || ""}",
  "character": "${creative.character || "male"}"
}

You are an expert voiceover scriptwriter for ${businessName}, a ${business.industry || "business"}.

${businessContextBlock(business)}

You write AUDIO ONLY. Your output is spoken narration that will be read aloud by ElevenLabs TTS over background music. No camera directions, no shot lists, no on-screen text — just the words the voice will say.

STEP 0 — DECIDE THE AD'S MODE (do this first, silently — this decides everything below)
Read the idea and the business context, then pick exactly ONE mode that genuinely fits — never default to TRANSFORMATION just because it's the most detailed option below. Be able to justify your choice from the idea itself.
${AD_MODES}

HARD RULE — THE IDEA'S OWN CONTENT MUST SURVIVE INTO THE SCRIPT, NO MATTER WHICH MODE YOU PICKED
Whichever mode you chose above, the act structure is a SHAPE to pour the idea into, not a replacement for it. Every specific detail, claim, phrase, or instruction the idea above actually contains must show up somewhere in the script you write — you may ADD supporting detail beyond what the idea says, but you may never DROP, water down, or silently swap out something it explicitly says just because the chosen mode's template beat doesn't obviously fit it. If the idea has its own distinctive angle, phrasing, or voice, that specific angle belongs in the hook (Act 1) and should keep surfacing through the rest of the script — never replace it with a generic, templated line that could have been written without reading the idea at all. The business-context facts above (core offerings, pain points, audience, etc.) exist to ground and support what the idea says, never to override or substitute for it — if the idea and the business context ever seem to pull in different directions for a given line, the idea wins. Before writing, silently check: does every distinct thing the idea said actually appear in what I'm about to write? If something got dropped, put it back before returning.

Convert the idea in the input into a polished voiceover script with a clean arc and TTS-friendly rhythm, following the ACT STRUCTURE for your chosen mode:

${Object.entries(AD_MODE_STRUCTURES).map(([mode, structure]) => `--- ${mode} ---\n${structure}`).join("\n\n")}

Required fields:
- idea       → source description of what this ad should be about
- duration   → total audio length in seconds
- character  → male / female / couple (only relevant for modes with a protagonist)

${descriptor ? `THIS AD IS SPECIFICALLY FOR: ${descriptor}. Every claim must be about this service — never blend in another.\n\n` : ""}IF YOUR MODE HAS A PROBLEM/NEED AT ITS CORE (TRANSFORMATION, PROMOTION_OFFER, SERVICE_SPOTLIGHT)
Before writing Act 1, silently work out: what specific real-world need or dissatisfaction is this idea actually about${descriptor ? ` — this is for "${descriptor}", so ground your answer in what that service actually treats` : ""}? Then write 2-3 concrete, natural ways a real person would describe it (specific and sensory, never a vague "something is wrong"). Use that grounding for every relevant line below.

IF YOUR MODE CENTERS ONE PERSON'S STORY (TRANSFORMATION, PROMOTION_OFFER following a customer, TESTIMONIAL_PROOF)
ASSIGN ONE NAME, use it throughout:
- Male:   James, David, Mark, Daniel, Thomas, Michael
- Female: Sarah, Emma, Maria, Anna, Lisa, Sophia
- Couple: Mark and Anna, David and Lisa, Thomas and Emma
Use the character's name in line 1 at minimum. PRONOUN IS NOT A FREE CHOICE — it's dictated entirely by the "character" field above, never picked independently: male -> he/him/his only, female -> she/her/hers only, couple -> they/them/theirs (or both names) only. Never use the other gender's pronoun anywhere, not even once. This matters beyond the words themselves — the video's visuals are generated separately from this script and will show a character matching that same field, so a mismatched pronoun in the audio makes the finished video look wrong even though each half was made correctly on its own. Check every single line before returning; one wrong pronoun anywhere is a failure.

IF YOUR MODE IS NOT ABOUT ONE PERSON'S STORY (BRAND_INTRO, EDUCATIONAL_AUTHORITY, ANNOUNCEMENT, EVENT_SEASONAL)
Write in second person ("you") or about the business directly — no named individual required.

LINE COUNT AND LENGTH — ${minSceneCount} SCENES IS THE FLOOR, NOT AN EXACT TARGET
Each script line becomes one video scene downstream, and each scene's own clip is sized to that scene's own measured narration length (4-12s, not a uniform fixed length) — so the total video length is however long the story actually needs, not a fixed number, and the requested duration is a floor, not a ceiling. The script array MUST have AT LEAST ${minSceneCount} lines (matching the requested ${creative.duration || "28 seconds"}) — but if the idea is rich enough that telling it properly, without rushing a beat or cutting the ending short, genuinely needs more room, use more lines, up to ${maxSceneCount}. Never fewer than ${minSceneCount}, never more than ${maxSceneCount}. A complete, well-paced script that runs a bit longer than requested is always better than a rushed or truncated one that hits the number exactly — don't pad a simple idea with filler lines just to reach the max either; use exactly as many as this specific idea earns.
Each line = ONE complete sentence, 6-9 words. Hard cap at 10 words — a line at the cap is already a full scene's worth of natural spoken pace, so most lines should be shorter than that, not at it. This per-line cap, not a total word count, is what actually keeps each scene's spoken audio comfortably short.

TTS-FRIENDLY WRITING RULES
- End every line with a period. One sentence per line. Use commas for natural breath pauses inside a line.
- NEVER use: em dashes, semicolons, colons, ellipses, quote marks, parentheses, asterisks, hashes, slashes, ALL CAPS.
- Plain, conversational ${language || "English"} at a natural everyday reading level${language ? "" : " (5th-8th grade)"}. Spell out numbers under twenty. Avoid abbreviations${language ? "" : ", foreign words"}, technical jargon.
- Mention "${businessName}" by name AT MOST ONCE across the whole script, at the point where it's most natural for your chosen mode's structure.
- Avoid tongue-twisters, clusters of similar consonant sounds, and rare or hard-to-pronounce words — prefer short, common, everyday words a voice actor could read smoothly in one breath. This is spoken narration, so clarity of delivery matters as much as meaning.

HARD CONSTRAINT — NEVER PULL A PRICE, DISCOUNT, PERCENTAGE, OR DATE FROM BUSINESS CONTEXT ON YOUR OWN
State a specific price, percentage, discount, or date ONLY if the idea/brief above itself explicitly mentions one. Never take a number or date like that from the business context section on your own initiative just because it happens to appear there, and never invent one either — if the business context above mentions a discount, price, or date but the idea doesn't ask for one, leave it out of the script entirely. This applies especially to PROMOTION_OFFER and EVENT_SEASONAL: if the idea itself states the real offer/date, use exactly that; if the idea doesn't give you one, write the ad around the general idea of an offer/occasion without stating any specific number or date, rather than reaching into the business context for one.

FORBIDDEN CONTENT — ALWAYS
1. Body-shaming words: fat, ugly, gross, deformed, hideous
2. One-time accidents as the cause (fell off a ladder, car crash) unless the idea explicitly describes one
3. Multi-action sentences (he sits and smiles and drinks)
4. Quotation marks, em dashes, asterisks, emojis, hashtags, ALL CAPS
5. Dialogue ("he says", "she tells him")
6. Naming competitors, other venues, or other brands
7. Switching identity, gender, age, or name mid-script
8. Repeating the business name more than once across the whole script

IF (AND ONLY IF) YOUR MODE IS TRANSFORMATION *AND* THIS BUSINESS'S OWN INDUSTRY/OFFERINGS ABOVE ARE HEALTH, MEDICAL, OR COSMETIC
Also forbid, in addition to the list above:
1. Surgical, procedural, or recovery descriptions
2. Pain, blood, needles, instruments, side effects, risks
3. Medical jargon (e.g. alopecia, malocclusion, obesity, rhinophyma) — describe things the way a real person would, not a clinician
4. Time markers (three weeks later, six months on, before, after, suddenly)
Never narrate: surgery, anesthesia, instruments, pain, recovery, swelling, stitches, specific medical/technical procedure names, risk/complication/warning/side-effect language.
For any other mode, or any other kind of business, this section does not apply — do not apply medical-sensitivity language to a business or ad type it has nothing to do with.

OUTPUT FORMAT — STRICT
Return ONLY valid JSON. No markdown fences. No commentary. No preamble.

{
  "ad_mode": "one of: ${Object.keys(AD_MODE_STRUCTURES).join(" | ")}",
  "visual_mood": "one of: CLEAN_PRECISE | WARM_APPROACHABLE | PREMIUM_CONSIDERED | BOLD_ENERGETIC | PLAYFUL",
  "script": [
     "Line one.",
     "Line two.",
     "Line three.",
     "Line four."
  ]
}

Rules:
- "ad_mode" must be exactly one of the 8 modes above, chosen genuinely, not defaulted.
- "visual_mood" is the ONE visual archetype that best matches this business's own voice/description above — pick deliberately, never the same one every time just because it's safe.
- "script" must be a JSON array of between ${minSceneCount} and ${maxSceneCount} strings (inclusive), one sentence per element, in order — see LINE COUNT AND LENGTH above for how to choose the actual count.
- No extra fields, no trailing commas.

SELF-CHECK BEFORE RETURNING (silently confirm each):
1. ad_mode genuinely fits the idea — not defaulted to TRANSFORMATION out of habit
2. The chosen mode's ACT STRUCTURE was followed, not the wrong mode's
3. If a protagonist mode: same name and the ONE correct pronoun set (matching the character field) in every single line — no exceptions
4. Line 1 is a scroll-stopping HOOK matching the chosen mode's Act 1
5. Script array has between ${minSceneCount} and ${maxSceneCount} elements, and the count actually matches how much story there genuinely was to tell — not padded, not rushed
6. Each line is independently under the 10-word cap
7. "${businessName}" appears at most once
8. No fabricated number, price, or date anywhere
9. Medical-sensitivity list applied only if TRANSFORMATION + a genuinely health/medical/cosmetic business — never otherwise
10. No forbidden punctuation, abbreviations, or characters
11. JSON is valid, script is an array of strings, no markdown fences, no extra fields
${language ? `12. Every single line is written entirely in ${language} — not English, not mixed\n` : ""}If any check fails, fix before returning.
`;
}

export function getVisualPromptsPrompt(scriptLines: string[], creative: any, business?: any): string {
  const businessName = business?.name || "the business";
  const n = scriptLines.length;
  const descriptor = serviceDescriptor(business, creative?.service);
  const protagonistGender = creative.character || "male";
  const hasReferenceImage = !!creative.hasReferenceImage;
  const adMode: string = creative.adMode || "TRANSFORMATION";
  const isTransformation = adMode === "TRANSFORMATION";
  const hasProtagonist = MODES_WITH_PROTAGONIST.has(adMode);
  const isPosterMode = creative.videoMode === "animated_poster";
  const hasLogo = !!creative.hasLogo;
  const brandColor: string | null = creative.brandColor || null;

  return `Generate visual prompts for the script below. Return ONLY the JSON object — no markdown, no preamble.

INPUTS
- Business: ${businessName}
- Ad mode: ${adMode}
- Video format: ${isPosterMode ? "ANIMATED POSTER & GRAPHICS — every scene is a designed graphic composition, not live-action photography (see the POSTER MODE section below)" : "LIVE ACTION — photorealistic scenes"}
- Character gender: ${creative.character || "male"} (only relevant if this mode has a protagonist — see below)
- Video style: ${creative.videoStyle || "Cinematic"}
- Duration: ${creative.duration || "28 seconds"}
- Scenes to generate: ${n}

SCRIPT LINES (one prompt per line, in order)
${scriptLines.map((item, index) => (index + 1) + ". " + item).join("\n")}

MANDATORY EXECUTION
Generate exactly ${n} objects in visual_prompts, in the same order as the lines above. Script content is the HARD rule for what each scene shows — never invent a different subject or setting than what the line describes.

${isPosterMode ? `POSTER MODE — every scene is a designed graphic, not a photograph
This entire video is a sequence of composed, poster-style graphics with slow camera movement — think of it as a real, professionally designed motion-graphic ad, the kind many brands actually run as social ads, not a photo slideshow. All ${n} scenes must look like ONE consistent design system, not ${n} different ads stitched together — decide these three things ONCE, before writing scene 1, then describe them in the EXACT SAME words in every single scene's prompt below, changing only the on-scene text and any scene-specific photo/element:
- BACKGROUND: ${brandColor ? `this business's real brand color is ${brandColor} — use it (or one specific, fixed gradient/variant of it, decided once) as the primary color of every scene's background, never a generic guessed color and never a different color per scene.` : "one specific, deliberately designed background treatment matching the visual mood below (a solid or gradient color, soft abstract accents, a faint motif genuinely relevant to this business) — decide the exact treatment once and reuse it, word-for-word, in every scene."} Never a blank or generic template, and never a different background style from one scene to the next.
- TYPOGRAPHY: decide ONE specific font style/treatment once (e.g. "bold modern sans-serif headlines in white") and describe it identically in every scene's prompt — never a different font style, weight, or text color scheme per scene.
- PHOTO/ELEMENT (optional): if this specific scene benefits from a photo or icon-like element, integrate it as one part of the composition, not a full-bleed background. Not every scene needs a photo — a scene may also be a purely typographic/graphic composition, an icon or symbol representing the service, or an abstract design moment.
${hasLogo ? `- LOGO: this business has a real logo on file, but it is only ever attached as a reference image to the ONE scene marked "shows_business_location": true in your JSON output (see OUTPUT FORMAT below and the BRANDED SIGNAGE rule) — never to any other scene. Do not describe or depict a logo/brand mark in any scene's prompt text unless this is that one scene.` : `- This business has no logo on file — do not depict a logo or brand mark.`}
- ACCENTS: decide ONE recurring accent motif once (e.g. "a thin gold divider line above the CTA area") and describe it identically wherever it appears — genuinely tied to this business, never unrelated decoration, and never a different accent style per scene.

For this mode, the IMAGE PROMPT FORMULA and VIDEO SCENARIO FORMULA below are replaced with:
IMAGE PROMPT FORMULA (poster mode): [BACKGROUND TREATMENT, identical wording every scene] + [TYPOGRAPHY STYLE, identical wording every scene] + [PHOTO/ELEMENT, if any] + [ON-SCENE TEXT for this line, quoted exactly] + [ACCENTS, identical wording every scene] + [overall composition/framing note], 3-5 sentences.
VIDEO SCENARIO FORMULA (poster mode, 10-20 words): describe the CAMERA MOVEMENT over this static design — a slow zoom, a gentle pan, a subtle parallax drift — never a person's physical action, since nothing in the frame moves on its own.
GOOD: "Slow, gentle zoom into the headline text as the soft background gradient drifts almost imperceptibly."
BAD: "Man pauses at the mirror." (this is a live-action description, wrong for poster mode)
Skip the STEP 1-4 sections below entirely — they describe live-action condition/phase logic that doesn't apply to a graphic composition. Skip MAIN CHARACTER CONSISTENCY too unless a specific scene genuinely includes a photo of a person.

` : `STEP 1 — DIAGNOSE THE CONDITION AND ITS SENSITIVITY (only if ad_mode is TRANSFORMATION and the script is about a physical/health transformation — otherwise skip this step entirely and move to STEP 2)
${isTransformation ? `Read the full script${descriptor ? ` (this is for "${descriptor}")` : ""} and identify the specific real-world condition or dissatisfaction it's actually about — describe it in plain words, not a category label. Then decide its depiction tier:
- Tier 1 — a purely physical/cosmetic appearance concern (hair, skin, teeth, body shape, vision, nose/facial profile): may be shown directly but tastefully.
- Tier 2 — something better implied than shown outright (aging, weight/body contouring): imply through posture, wardrobe, and mirror moments rather than graphic depiction.
- Tier 3 — a private, sensitive, or non-visual condition (fertility, mental health, an internal or chronic illness, oncology): never depict the body or condition — use consultation and quiet-emotion framing only (a warm room, a caring listener, a moment of relief).
If genuinely unsure which applies, default to the more conservative tier.

CONCRETE VISUAL ANCHORS BY CONDITION TYPE — these exist because a vague or purely emotional "before" state (a sad face with no visible cause) reads as weak and unconvincing next to a specific one; adapt whichever of these actually matches what the script describes, don't invent a softer version when a concrete, tasteful one like these is available for a Tier 1 condition. These are illustrative starting points to adapt to the script's own wording, not a fixed script to copy verbatim:
- Teeth/dental: BEFORE — visibly discolored, crooked, chipped, or gapped teeth; a closed-mouth or hand-over-mouth smile, hesitant to laugh openly on camera. AFTER — an open, relaxed smile showing straight, white, healthy teeth.
- Eyes/vision: BEFORE — thick prescription glasses, visible squinting, holding reading material unusually close, tired eye-rubbing, hesitant movement in bright light. AFTER — clear-eyed ease — reading, driving, or taking in a view comfortably, without squinting or glasses (unless the specific condition/service doesn't remove that need, in which case: relaxed and unbothered by them).
- Skin: BEFORE — visibly uneven tone or texture, blemishes or scarring shown tastefully, avoiding mirrors or bright light, camouflaging with heavy makeup or coverage. AFTER — clear, even, healthy-looking skin, comfortable in natural light and close-up shots.
- Weight/body: BEFORE — ill-fitting clothing, tired or slumped posture, sitting out of physical activity. AFTER — well-fitted clothing, energetic posture, actively joining in.
- Hair: BEFORE — visible thinning or loss and self-conscious grooming habits (hat, adjusting hair, avoiding bright light or mirrors). AFTER — natural, healthy-looking hair and relaxed confidence.
- Nose/facial profile (rhinoplasty): BEFORE — describe an actual visible trait in profile or a mirror close-up: a visible bump or bridge irregularity, or a fuller/wider nose shape, plus self-conscious behavior (touching or examining it, avoiding side-on photos or profile angles). AFTER — a balanced, refined profile and a relaxed expression, comfortable being seen and photographed from the side. Do not describe only a worried expression with no visible trait — a mirror scene where nothing about the nose itself is actually described will render as a normal-looking face with no visible problem, which defeats the scene's purpose.
For any other condition the script describes that isn't one of these, apply the same principle: find the ONE concrete, specific, tasteful physical or behavioral detail a real person with that exact condition would show or do differently before vs. after, and describe that detail explicitly in the prompt text itself — never settle for describing only an emotion or expression ("looks worried," "looks sad") with no actual visible physical trait named, since the image model can only render what the words actually describe.` : `This ad's mode is ${adMode}, not TRANSFORMATION — there is no physical condition to diagnose or depict. Skip straight to STEP 2.`}

STEP 2 — PHASE (mood only, never overrides script content)
${isTransformation
    ? `Phase 1 (roughly the first third of scenes) = PROBLEM mood: cooler, dimmer lighting, more withdrawn body language.
Phase 2 (roughly the middle third) = JOURNEY mood: warm-neutral light, curious/hopeful body language.
Phase 3 (roughly the final third) = RESOLUTION mood: warm golden light, open/confident body language.
The phase sets lighting and mood only — the literal action and setting always come from the script line.`
    : `This mode doesn't need a forced problem-to-resolution mood arc. Keep a consistent, confident, on-brand mood throughout that matches the visual mood below — the literal action and setting always come from the script line, not from a phase.`}

STEP 3 — WRITE SCENES LITERALLY FROM THE SCRIPT
${isTransformation
    ? `If a line's content matches a milestone in the customer's journey (first contact, arrival, meeting an expert, a consultation), write that scene literally and specifically rather than generically:
- First-contact / arrival scene: a warm handshake or welcome moment with a team member, visible relief.
- Expert/consultation scene: write it specifically for the actual condition diagnosed in STEP 1 — the doctor and setting should visibly relate to that exact body part or concern (e.g. examining hair/scalp, a dental chair with a mirror and light, a skin-analysis monitor, an eye device), not a generic "doctor talking to patient" shot. For a Tier 3 condition, skip the physical exam entirely — a compassionate consultation instead: patient seated across from a kind expert in a soft, warm room, a supportive hand on the shoulder, dignified composition, no medical equipment, no gown.`
    : `Write each scene literally and specifically from its own script line's content — a concrete, real moment (a specific place, a specific action, a specific interaction), never a generic stock-photo-feeling shot that could belong to any business.`}

STEP 4 — THE CONDITION MUST VISIBLY CHANGE, BEFORE VS. AFTER (TRANSFORMATION mode only — skip entirely for every other mode)
${isTransformation ? `The specific condition STEP 1 diagnosed from the script must look UNMISTAKABLY, OBVIOUSLY PRESENT in every Phase 1 scene and UNMISTAKABLY, OBVIOUSLY RESOLVED in every Phase 3 scene — not subtle, not implied, not a near-identical shot with a slightly different mood. Apply this test: someone glancing at only a Phase 1 frame and only a Phase 3 frame, side by side, with no other context, must immediately see two visibly different states of the same person's specific condition — if they could be mistaken for the same shot, the difference is not strong enough. This is true even for Tier 1 conditions where "tasteful" applies — tasteful means not graphic or exploitative, it does NOT mean subtle or barely visible; the condition itself must still read clearly at a glance. Tier 2/3 conditions stay within their own softer depiction rule from STEP 1, but the shift in posture, confidence, and framing between phases must still be obvious, not ambiguous. Do not default to the protagonist's normal, healthy, camera-ready appearance throughout the whole video — that erases the entire transformation the script is telling. Read the exact words the script uses to describe the "before" state and depict that specific, strong visible difference in Phase 1; read the script's own words for the resolved "after" state and depict that instead in Phase 3.
This still applies — and is NOT optional — when a reference photo is configured: the reference photo locks the protagonist's face and identity, but the ONE specific visual attribute the diagnosed condition concerns (derive it from the condition itself — e.g. hair thickness/coverage for a hair condition, tooth appearance for a dental one, skin clarity for a skin one) MUST still visibly and strongly differ between Phase 1 and Phase 3, overriding the reference photo's default appearance for that one attribute only — this explicitly overrides MAIN CHARACTER CONSISTENCY's "don't invent new features" rule below for that one attribute alone. Every other feature of their face and identity stays exactly as the reference photo defines.` : `Not applicable to ${adMode} — do not force a before/after visual difference where the script doesn't call for one.`}

MAIN CHARACTER CONSISTENCY (whenever a scene actually shows the protagonist)
${hasProtagonist ? `Whenever a script line calls for showing the protagonist, they are always ${protagonistGender} and must be the clear PRIMARY subject of that frame — described first in the prompt and unambiguously the visual focus (largest in frame, sharpest focus, centered or rule-of-thirds placement). Every single scene's own prompt text must explicitly state this gender as an unambiguous noun ("a man" / "a woman") at the point the protagonist is introduced in that scene's character description — never rely on just a name or a pronoun to imply it, since the image model reads each scene's prompt independently and a name/pronoun alone is a far weaker signal than stating the gender directly. Not every scene needs to include them, though — per SCENE VARIETY below, a scene may instead show the business, an environment, equipment, or something else with no person in it at all, whenever that's what the script line actually describes. If a scene naturally includes another person (a doctor, specialist, staff member, family member, or friend) alongside the protagonist, describe that person as a clearly SECONDARY presence with their own distinct age/role framing — never in a way that could be confused with or visually substitute for the protagonist. Never contradict the protagonist's gender anywhere in the prompt, even implicitly through pronouns or wardrobe.
${hasReferenceImage ? `A reference photo of the ${protagonistGender} protagonist is injected downstream and will lock their face to it in any scene where they appear — this makes the PRIMARY-subject framing above critical, since the face-lock is applied to whichever person the image model treats as the main subject of the frame. Do not invent new facial features, hair color/style, skin tone, or ethnicity for the protagonist in the prompt text beyond what STEP 4 requires — the reference photo already defines their face and identity; only describe their wardrobe, posture, and expression/emotion${isTransformation ? ", EXCEPT for the one condition attribute STEP 4 requires you to override (e.g. hair thickness for a hair condition), which takes precedence over this reference-lock for that attribute only" : ""}. Any secondary person in the scene keeps their own separate, different appearance so they are never mistaken for the reference-locked protagonist. The reference photo locks FACE AND IDENTITY ONLY — this scene's lighting, mood, background, and setting always come from STEP 2's phase and the script line, never from the reference photo.\n` : ""}` : `This mode (${adMode}) doesn't center one person's story — scenes may show the business, team, environment, product, or multiple different people without needing one consistent locked individual. If a specific person does appear in a scene (e.g. a team member, a customer moment), keep them realistic and consistent WITHIN that one scene, but there's no cross-scene identity to lock.`}

IMAGE PROMPT FORMULA (3-5 sentences per prompt)
[CHARACTER + WARDROBE, matching the phase's body language] + [LITERAL ACTION from the script line] + [LITERAL SETTING from the script line] + [LIGHTING + PHASE MOOD] + [CAMERA ANGLE + MOVEMENT + SHALLOW DEPTH OF FIELD] + [REALISM ANCHORS + STYLE MODIFIER]

Mandatory realism anchors: photorealistic, cinematic, 35mm lens, shallow depth of field, natural skin texture, hyperdetailed, 8k.
Style modifier by video style:
- "Bold & Colorful" → vibrant saturated color grade, punchy contrast
- "Cinematic" → teal-and-orange grade, film grain
- "Documentary" → neutral grade, available light
- any other style → interpret literally and stay photorealistic

NEVER include: UI elements, speech bubbles, watermarks, brand names other than ${businessName}, surgical wounds, blood, exposed bodies, illegible or misspelled on-screen text, devices shown at an impossible or backwards angle, anatomically incorrect hands or limbs, physically impossible object interactions${isTransformation ? ", or (for Tier 3 conditions) any depiction of the body or condition itself" : ""}. On-screen text/logos are not forbidden outright — see BRANDED SIGNAGE below for the one narrow, controlled case where they're allowed.

VIDEO SCENARIO FORMULA (10-20 words)
Verbs first, matching the script line's literal action.
GOOD: "Man pauses at the mirror, hand runs through his hair, slow push-in."
BAD: "Man looks in mirror." (too vague, no specific action)

`}
${hasLogo ? `HARD CONSTRAINT — BRANDED SIGNAGE MUST USE THE REAL LOGO, NEVER AN INVENTED ONE, AND ONLY WHERE A LOGO REALLY BELONGS
The real logo reference image is attached ONLY to the one scene where you set "shows_business_location": true in your JSON output — no other scene's generation ever sees this reference image at all, so no other scene can faithfully copy it (which is also why no other scene should attempt to describe or invent one). This is the ONLY logo that may ever appear: if — and only if — a script line genuinely calls for a scene showing this business's own building, storefront, or entrance, mark exactly that one scene "shows_business_location": true and describe that logo as reproduced faithfully from the attached reference — same mark, same lettering, same colors${brandColor ? `, matching this business's real brand color, ${brandColor}` : ""} — never a different icon, symbol, font, or color scheme invented for that scene. If no scene has a genuine reason to show the building itself, mark every scene false and don't insert a logo or signage anywhere.
WHERE a logo may appear — EXACTLY ONE scene in the entire video, never more: the one specific scene marked "shows_business_location": true, where the script actually shows the protagonist arriving at or being at this business's own real premises for their visit/treatment. In that one scene only, the logo may appear on its exterior signage/entrance/storefront front, or one wall-mounted sign inside its lobby/reception area — that's it, and only there. This is how it actually looks in the real world: a hospital or clinic's logo lives on its own building, not scattered through every scene the story happens to visit.
WHERE a logo must NEVER appear, no exceptions, not even in that one allowed scene: on ANY person, full stop — the protagonist, any customer, any background or secondary person, any staff member, any doctor — nobody in any scene ever wears or carries this logo anywhere on their body: not on a shirt, t-shirt, jacket, hat, cap, uniform, badge, pin, patch, bag, or jewelry. The logo belongs on the building's own signage only, never on a person, no matter who that person is or how minor/background their role in the frame is. Also: every OTHER scene in the video besides that one signage scene — a home, a dinner table, a restaurant, a family gathering, a classroom or community room, a car, any location that is not this one business's own premises — must show ZERO branding: no logo, no wall sign, no framed picture, poster, or piece of wall décor that resembles or contains this business's mark, even in the background, even blurred, even small. Also never on any paper, form, document, folder, or brochure anyone is holding or that's sitting on a desk/counter, and never on any mobile phone, laptop, tablet, or computer/monitor screen shown in ANY scene (as an app icon, a website, a photo, a video-call window, or any other on-screen graphic, and never on the device's physical body/case either) — a screen shown in a scene, if it displays anything at all, must show generic or blank content. If the script doesn't clearly include one specific arrival/visit-to-the-business moment, don't invent one just to place the logo — it's better to show the logo in zero scenes than to scatter it onto a person or a scene that doesn't genuinely belong to this business's own premises.
Getting either of these wrong (an invented logo, or the real logo in an implausible place) is a real, visible brand-consistency failure, not a minor stylistic slip — treat it with the same seriousness as the anti-fabrication rules above.

` : `This business has no logo on file — if a scene shows generic signage, it must be blank, abstract, or otherwise free of any specific brand mark or invented logo.

`}SCENE VARIETY — not every scene needs to show a person as its main subject
Depending on what each script line actually describes, a scene may instead show: the business's building or facility exterior, an aerial or drone establishing shot of the location, the interior environment or atmosphere on its own, a close-up on relevant equipment, tools, or materials used in the service, signage or branding elements, a hands-only shot of an activity in progress, a detail or texture shot that sets a mood, or a time-of-day/atmosphere shot of the setting. Use whichever genuinely matches that specific script line — never force a person into a scene by default just because other scenes have one. This applies even in modes with a protagonist: an establishing or atmosphere scene without them is often a stronger transition than another shot of the same person.

LOGICAL / TECHNICAL CONSISTENCY (always required, in every mode and format — these are the most common AI-image failures, avoid them explicitly)
- Any text visible anywhere in the frame (screens, signage, documents, labels${isPosterMode ? ", the on-scene text itself" : ""}) must be spelled correctly and rendered sharp and legible — never blurred or hidden. Keep any such text short and simple rather than full sentences, so it renders correctly.
- ON-SCREEN NUMBERS AND CLAIMS — any number, price, percentage, or date depicted as visible text in a scene (a screen, a sign, a document, a billboard${isPosterMode ? ", the poster's own on-scene text" : ""}) must be IDENTICAL to the real figure stated in the business context or brief above — never a different, rounder, or more dramatic number for visual effect, even if the script itself states the real one correctly. If no real number exists for what a scene would naturally show, depict that surface as generic or textless rather than inventing a number on it.
${!isPosterMode ? `- DEVICE / SCREEN CAMERA GEOMETRY — the single most common failure: a screen is only legible from directly in front of it, never from behind it or from where the person using it already stands. For ANY scene with a laptop, phone, tablet, or monitor, pick exactly ONE of these two shots and follow it precisely — never blend them: (a) OVER-THE-SHOULDER — camera behind or beside the person, looking past them at the screen, so we see the person from behind/the side and the screen's content faces both them and the camera, since they share the same side of it; or (b) FACE-ON, SCREEN AS PROP — camera in front of the person's face, and the screen faces AWAY from camera (we see only its back, lid, or a soft glow on the person's face) — never describe its front display or any content on it in this framing. NEVER put a screen's front/display panel facing the camera in the same frame as the person's face also facing the camera — that requires two contradictory camera positions at once and is the exact failure to avoid. Whichever shot you pick, the person's eye-line and head direction must be physically consistent with actually looking at wherever the screen really is in the frame — never describe a person as looking at or reading a screen while their gaze/head direction points somewhere else; if the action doesn't actually require them to be looking at the screen, don't describe the screen as something they're viewing at all. The same rule applies to any other reflective or legible surface a scene might include (a mirror, a window, glass) — it only shows its reflection or content to a viewer standing where it actually faces, never to both sides at once.
- MULTI-PERSON ANATOMY — when two or more people share a frame, each person's head, neck, and torso must be anatomically continuous, correctly proportioned, and correctly attached — no visible seams, no neck stretching or elongation, no head/body misalignment, no floating or duplicated limbs. Each person must read as one coherent physical body, not a composite of mismatched parts.
- HAND GESTURES — avoid describing precise, fine-grained gestures that are commonly misrendered (holding up an exact number of fingers, an OK sign, a specific counting gesture). These frequently render ambiguous, malformed, or unrecognizable. Prefer broad, clearly legible body language instead (an open welcoming palm, a natural conversational hand movement, a relaxed gesture toward something) that reads correctly as intended even without fine anatomical precision.
- SMALL HELD OBJECTS (phones, cups, books, and similar) — always one single, solid, seamless object held naturally in one hand, its full outline clear and continuous — never multiple overlapping pieces, never fragmented, floating, or disconnected parts. Prefer a medium shot with the object naturally in-hand over an extreme close-up on the object itself, which is far more likely to render malformed.
- Hands must have exactly five fingers each, correct proportions, and natural, physically possible poses — no distorted, extra, fused, or missing digits or limbs.
- Every object and interaction must obey real-world physics and logic — correct hand-to-object contact, correct scale between objects and people, correct reflections and shadows, nothing floating, interpenetrating, duplicated, or arranged in a physically impossible way.
- LIMB ORIENTATION AND NATURAL POSE — arms and legs must bend only in anatomically correct directions and stay physically attached in a natural position — never a limb that appears rotated backward, twisted, reversed, or bent the wrong way at a joint. When a scene shows someone walking or moving, their arms swing naturally at their sides in the direction of travel — never trailing unnaturally behind the body, crossed behind the back in an impossible way, or positioned as if a joint bent the wrong direction.
- DUPLICATE OR SIMULTANEOUS OBJECT USE — never describe a person using two of the same object at once (a pen in each hand, writing with both hands, holding two phones) or independently operating two separate objects with each hand at the same time, unless the script line explicitly and specifically calls for exactly that. A person interacts with one object using one hand in a natural way at a time; the other hand rests naturally or supports the action rather than duplicating it.
- DEVICE PLACEMENT MUST MATCH BODY ORIENTATION — whenever someone is described as using a laptop, phone, or tablet, its physical position and orientation must make real-world sense relative to exactly where that person is sitting or standing: within natural arm's reach, angled so its keyboard/screen genuinely faces them, with their torso, hands, and gaze all consistently oriented toward it. Never describe the device as turned a different direction than the person is facing, positioned somewhere their hands couldn't naturally reach it, or being "used" while the person's body is oriented away from it — if you can't describe a single, coherent body position that would actually let this person operate this device where you've placed it, change the description until you can. On a LAPTOP specifically, hands/fingers rest on the keyboard or trackpad — never touching or pressing the actual screen/display panel, which is not a touchscreen in this context. When ONE device (a tablet, a chart, a screen) is being shown BY one person TO another (e.g. a doctor showing a patient something), its screen must be angled toward whichever of the two people is described as looking at it — and that person's gaze must actually point at the device, not past it or in some other direction; never describe both people as looking at a screen that's only physically angled toward one of them.
- SEATED POSTURE MUST MATCH THE CHAIR — a seated person's body faces the same direction their chair faces, with their back against the chair's back and their front toward whatever they're doing (the table, the camera, the person they're talking to). Never describe a chair positioned between the person and the camera/table in a way that would require them to be facing backward, straddling it, or leaning over its back to appear in frame — if a chair is visible in the shot, the person's seated position relative to it must be physically ordinary and unambiguous, not require deciding whether they're sitting normally, backward, or sideways.
- VEHICLE INTERIOR SEATING — a driver is always positioned in the driver's seat: front row, hands on the wheel, facing forward through the windshield. Any other person in the same scene must occupy a genuinely distinct, correctly-placed seat consistent with a real car's layout (front passenger seat alongside the driver, or a rear seat behind the front row) — never depict a driver and a passenger sharing the same row or seat, and never place a rear-seat passenger as if sitting directly beside a driver who is also somehow in that same seat/row. If the script puts the protagonist in the back seat with a driver, the driver must be described as ahead of them in the front seat, never beside them.
- HELD READING MATERIAL — a book, brochure, folder, or document must be gripped the way a person actually holds one while reading it: fingers wrapped naturally around its edge or spine, the object right-side-up and angled toward the person's own eyes/reading angle. Never describe it as upside-down, sideways to their line of sight, or gripped from an anatomically impossible angle.
- NO DUPLICATE OR TWIN-LOOKING PEOPLE — never describe a scene in a way that results in the SAME face/identity appearing as two different people in one frame (e.g. two visually-identical people stood side by side, greeting each other, or in a group). This risk is highest whenever a reference-locked protagonist shares a frame with a secondary person — that secondary person MUST be described with clearly, obviously different identifying features from the protagonist (different hair color/style/length, different build, different age, different face shape) so the two are never confusable, even at a glance. If a scene doesn't specifically need a second named person, describe the protagonist alone rather than adding a vague, underspecified "someone else" who risks rendering as a lookalike.` : "- Keep the composition clean and uncluttered — every element (text, photo/icon, accents) must sit legibly within the frame with no overlapping or cut-off pieces."}

CORE PRINCIPLE
Script content is the HARD rule.${!isPosterMode ? " Phase is a SOFT mood guide." : ""} Write positive, story-accurate, ${isPosterMode ? "cleanly designed" : "cinematically composed"} scenes — do not invent distress or damage beyond what the script line actually describes.

OUTPUT FORMAT — STRICT
Return ONLY valid JSON. No markdown fences. No commentary. No preamble.
{
  "visual_prompts": [
    {
      "scene": 1,
      "phase": ${isTransformation ? "1" : "null"},
      "script_line": "...",
      "prompt": "3-5 sentence ${isPosterMode ? "poster-composition" : "cinematic image"} description following the formula above.",
      "video_scenario": "10-20 word ${isPosterMode ? "camera movement" : "action"} description, verbs first."${hasLogo ? `,
      "shows_business_location": false`: ""}
    }
  ]
}
Array length must be exactly ${n}, in the same order as the script lines.${hasLogo ? ` "shows_business_location" must be true for AT MOST ONE scene in the whole array — the one scene (if any) that genuinely depicts this business's own building, storefront, or entrance — and false for every other scene, including every scene if none of them genuinely qualifies. This field is what actually controls whether the real logo reference image gets attached to that scene's generation — get it right.` : ""}`;
}
