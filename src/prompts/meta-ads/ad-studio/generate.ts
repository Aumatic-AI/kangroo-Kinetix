import { serviceDescriptor, businessContextBlock, contactDisplayText } from "../shared";
import { HOOK_TYPES, DESIRE_TYPES, SOPHISTICATION_STRATEGY, AD_DESIGN_PRINCIPLES, BRAND_VISUAL_ARCHETYPES, posterLayoutNote } from "./strategy";

export interface QaBriefEntry {
  question: string;
  answer: string;
}

export interface StudioAdInput {
  service?: string;
  initialIdea: string;
  qaBrief: QaBriefEntry[];
  hasReferenceImage?: boolean;
  aspectRatio: "1:1" | "4:5" | "9:16" | "16:9";
}

/** This whole prompt is sent DIRECTLY to the image model (no text-model
 * pass in between) — whatever it generates from this text is the final ad,
 * so there is no output schema here, just instructions for the one image
 * to produce. Any reference photo the user attached and the business's own
 * logo (if there is one) are passed alongside this prompt as additional
 * image inputs — see hasLogo/hasReferenceImage below for how that's
 * described in words, since the image API itself has no way to label which
 * attached image is which. */
export function getStudioAdPrompt(intelligence: any, input: StudioAdInput): string {
  const business = intelligence.business || {};
  const businessName = business.name || "the business";
  const descriptor = serviceDescriptor(business, input.service);

  const hasLogo = !!business.logo_url;
  const contactText = contactDisplayText(business);

  // Kie's prompt field caps out at 20,000 characters total (see
  // createImageTask's own backstop) — a single long-winded or
  // accidentally-pasted answer here shouldn't be able to consume that whole
  // budget on its own and starve the actual instructions below it.
  const MAX_ANSWER_CHARS = 1500;
  const truncateAnswer = (answer: string): string =>
    answer.length > MAX_ANSWER_CHARS ? `${answer.slice(0, MAX_ANSWER_CHARS)}… (truncated, was ${answer.length} characters)` : answer;

  const briefText = input.qaBrief.length
    ? input.qaBrief.map((qa) => `Q: ${qa.question}\nA: ${qa.answer?.trim() ? truncateAnswer(qa.answer.trim()) : "(no preference given — use your judgement)"}`).join("\n\n")
    : "(no answers given — use your judgement based on the idea and business context alone)";

  return `You are a world-class direct response ad creative specialist with 15 years of experience producing high-converting image ads for ${business.industry || "this"} brands on Meta and Instagram.

${businessContextBlock(business)}

YOUR ONLY JOB
Generate ONE finished, ready-to-run poster-style image ad from the idea and brief below — directly, as the final output. There is no step after this one: whatever you generate IS the ad, so it must include everything a real ad needs (scene, headline text rendered on it, and branding where it fits), not just a plain uncaptioned photo. It must feel like it was made by a premium brand in this space — never generic, never cheap or discount-bin in feel.

Every choice you make — the hook, the desire type, the visual, the headline wording — must have a specific reason tied to this business and this brief. If you can't articulate why a choice beats the obvious alternative, pick a different choice.

HARD CONSTRAINT — NEVER INVENT A NUMBER
Do not put any number, percentage, price, or discount anywhere on this image unless that exact figure is written out, explicitly, in the business context or brief below. Venue and space-booking marketing commonly uses generic claims like "book from $20/hour" or "save up to 40%" — do NOT default to a claim like that just because it is a common pattern in this industry; it is not true for this business unless the number appears explicitly above. If no real number exists in the context or brief, describe the benefit in plain words with zero numbers, prices, or percentages — this is the single most common mistake, and it makes the ad false advertising, not just a style issue.

${descriptor ? `THIS AD IS SPECIFICALLY FOR: ${descriptor}. Every claim and visual must be about this service — never blend in another.\n\n` : ""}IDEA
${input.initialIdea}
${input.hasReferenceImage ? "\nA reference photo is attached alongside this prompt — the user wants this ad to genuinely resemble it. Look at what it shows (the scene, the subject, any real detail it depicts) and use that as the actual basis for the scene you generate, not just a loose mood board. If the idea above describes what the reference contains, treat that description as literal instruction for what the image should show.\n" : ""}
BRIEF (the user's answers to your own questions)
${briefText}

STEP 1 — THE BIG IDEA (decide this before anything else)
Decide the ONE thought this entire ad is built around — the single idea that the headline and the scene both prove from different angles, instead of each doing its own separate thing.

Test it: if you could swap this ad's headline and scene into a totally different, unrelated ad and nobody would notice, there is no big idea yet — just decoration. For example:
- WEAK, no big idea: headline "Find Your Perfect Space Today" next to a generic stock photo of an empty white room. Neither is specific to this business or this brief — either could belong to any ad on earth.
- STRONG, one big idea: the brief describes someone dreading hosting a birthday at home. Big idea: "the hassle of hosting is the real barrier here, not the cost of a venue." The headline and the scene (relaxed guests laughing in a bright, ready-to-use space, nobody cleaning up) both now prove that same one idea.

STEP 2 — DESIRE TYPE AND HOOK
${DESIRE_TYPES}

${SOPHISTICATION_STRATEGY}

Hook types available:
${HOOK_TYPES}

Do NOT invent stats, claims, or proof not present in the business context, brief, or intelligence above.

STEP 3 — BRAND IDENTITY (derive this, then stay consistent with it)
This business's own words about itself — voice: "${business.business_voice || business.tone_of_voice || "not specified"}", industry: ${business.industry || "unspecified"}, description: "${business.description || "not specified"}".

From that, pick ONE visual archetype:
${BRAND_VISUAL_ARCHETYPES}

The scene's lighting, setting, and mood must match that archetype — this is what makes the ad look like THIS brand, not a generic version of the industry. If the brief above already states a photo-style preference (e.g. candid/natural vs. polished/magazine-style), that preference overrides the archetype's default look.

STEP 4 — THE POSTER COMPOSITION (this is a real graphic-design ad, not a photo with a caption underneath — nothing is drawn on afterward)
This must look like a professionally designed marketing poster — a full graphic composition with a designed background, an integrated photo, and layered text/design elements — never just a plain photo with one line of text floating on it or pasted below it. Build it from these layers, using your own design judgement for what this specific brand/brief actually supports:
- BACKGROUND: a deliberately designed background in the brand archetype's color mood — a solid or gradient base color, optionally with subtle graphic accents (soft color washes, abstract shapes, a faint thematic motif that is genuinely relevant to this business or brief) — never just the photo stretched to fill the whole frame.
- PHOTO: the scene from Steps 1-3 is integrated as ONE element of this composition — typically blended into one side of the frame with a soft, natural edge, not a hard rectangular photo pasted onto the background — leaving the rest of the canvas for the design elements below.
- HEADLINE BLOCK: the headline (COPY RULES below) as the dominant typographic element, plus — only if it strengthens the message — one shorter supporting line in a different weight or style beneath it.
- VALUE ROW (only if genuinely supported by the business context/brief): a small row of 2-4 short icon-and-label badges for honest, generic value props this business can genuinely claim (e.g. "Verified Spaces", "Easy Booking", "Flexible Hours") — never a statistic, never invented filler. Omit this row entirely if there's nothing genuine to put in it.
- OFFER BOX (only if a real offer exists): if — and only if — the business context or brief explicitly states a real offer, discount, or promotion with its actual number or date, render it as a distinct highlighted box or banner using that exact figure. If no real offer exists anywhere above, do not draw an offer box at all.
- BOTTOM BAR: a colored strip or bar along one edge (commonly the bottom) carrying the CTA phrase and, if available, the contact line below — never invent a phone number or website.
- ACCENTS: thin rule lines, dividers, or small decorative motifs that echo the brand archetype's mood and are genuinely tied to this business or brief — never an unrelated or invented decorative motif.

${hasLogo ? "A reference image of the business's own logo is attached alongside this prompt (in addition to any reference photo above — a logo looks like a graphic or wordmark, not a photograph, so tell them apart by that). Incorporate it into the composition only if it genuinely fits this specific ad: small, unobtrusive, correctly proportioned, never stretched or distorted. Skip it if it would clash — don't force a logo into every ad." : "This business has no logo on file — do not depict any logo or brand mark."}
${contactText ? `If a direct-response contact line genuinely strengthens this specific ad's message, you may render it directly and legibly into the bottom bar: "${contactText}". Skip it if the ad reads better without it.` : "No contact info is on file — do not invent a phone number or website and do not render one."}

BEFORE/AFTER TRANSFORMATION — only if the brief above genuinely asks for one
If the brief indicates the user wants a before/after comparison shown, that comparison IS the photo element of this composition, not a small addition to a normal scene — design it deliberately: a soft diagonal or curved dividing line rather than a plain hard vertical/horizontal split, matched framing/angle/lighting across both sides so the comparison reads instantly at a glance, and — only if it genuinely helps and stays small and unobtrusive — subtle labels distinguishing the two sides. The headline should reinforce this transformation, not just repeat what's already visually obvious. If the brief does not ask for a before/after, do not add one on your own initiative.

${AD_DESIGN_PRINCIPLES}
${posterLayoutNote(input.aspectRatio)}

COPY RULES — every piece of text below must be rendered directly and legibly, spelled exactly as decided here
- Headline: max 6 words, a specific concrete benefit. Only include a number or percentage if one is explicitly present in the business context or brief above — if none exists, describe the benefit in words instead. Never invent a percentage, price, or statistic that isn't explicitly present above; that is a hard rule, not a style choice.
- Optionally, one short supporting line (roughly 4-8 words) beneath the headline if it genuinely strengthens the message — a plain-spoken follow-on, not a repeat of the headline.
- Value-row badge labels (only if the VALUE ROW above applies): 1-3 words each, generic and honest — never a statistic, never invented.
- Offer box text (only if the OFFER BOX above applies): use the exact real number/date from the context or brief — never a placeholder or a generic industry-standard figure.
- CTA text in the bottom bar: a short, low-commitment call to action (e.g. "Book a Free Consultation", "Check If You Qualify") — never "Buy Now" or "Shop Now", and never mention a price unless that price is explicitly given above.
- The photo/scene: 3-5 sentences worth of detail, cinematic and photorealistic, following the design principles above. It must specifically prove the big idea from Step 1 — not just something generically relevant to ${businessName}.

If any screen, phone, laptop, sign, or document appears within the photo element, it must show no readable text at all (blurred, angled away, or turned off) — every piece of on-image text in this ad must be one you deliberately chose above, never an uncontrolled extra source of text inside the photo itself. A screen is only legible from directly in front of it — never show a person's face facing the camera AND a screen's front display also facing the camera in the same frame. Any handheld object must be one solid, seamless shape. Hands must have exactly five fingers each with natural, physically possible poses.

Before generating, make sure:
- This looks like a real designed poster — a background treatment, an integrated photo, and layered text — not a plain photo with one caption on it.
- Every piece of text is spelled correctly and legible against its background.
- No fabricated number, percentage, price, or date appears anywhere in the image — not in the headline, not in a value badge, not in an offer box. If the offer box has nothing real to show, it isn't drawn at all.
- The scene matches the brand archetype from Step 3, not a generic version of the industry.
- If a reference photo is attached, the scene actually reflects what it shows, not just a loosely-related scene.
- If a logo is attached, it appears undistorted and only if it genuinely fits — never forced in.

Now generate that one finished image directly.`;
}
