/** Marketing and ad-design knowledge, in one place. questions.ts and
 * generate.ts both read from here instead of repeating this reasoning
 * inline — this is the file to check or extend when the AI's strategy
 * or design judgement needs to change. */

export const HOOK_TYPES = `Pick exactly ONE — never stack more than one, or the ad starts to feel like a manipulative checklist instead of one clean idea:
- COST SAVINGS: a specific price comparison or percentage saved.
- PROOF (persuasion lever: social proof): a real number of customers served or a rating.
- FEAR REMOVAL: name a common hesitation and answer it directly.
- TRANSFORMATION: before vs. after framing.
- URGENCY (persuasion lever: scarcity): a real, believable scarcity signal.
- TRUST (persuasion lever: authority): credentials, accreditations, expert care — whatever is real for this business.
- RECIPROCITY (persuasion lever: reciprocity): lead with something genuinely free/given first (a free assessment, a guide, a no-obligation quote) before asking for anything.
- UNITY / BELONGING (persuasion lever: unity): frame the offer around identity or group ("for people who refuse to settle for X"), not just the outcome.

Never invent fake scarcity, fake numbers, or fake testimonials to force a hook to fit — if the business context doesn't honestly support a lever, pick a different one instead.`;

export const DESIRE_TYPES = `Pick exactly ONE desire type for this ad, based on what the brief actually supports — never default to emotional automatically:
- FUNCTIONAL: what the service literally does (no downtime, one visit, a higher success rate).
- EMOTIONAL: how it feels (relief, confidence, no longer hiding something).
- ASPIRATIONAL: who it makes the person — the version of themselves they want to be seen as.`;

export const SOPHISTICATION_STRATEGY = `Read the self-performance data before choosing a style:
- Angle barely used yet: a direct claim is fine — state the benefit plainly.
- Angle already run several times: lead with a NEW mechanism or reason instead of repeating the same claim.
- Angle clearly worn out: drop the claim entirely and rely on a pure feeling/identification image — no explicit pitch at all.`;

/** The image model generates the ENTIRE finished ad in one shot now — a real
 * graphic-design poster (background treatment, integrated photo, typographic
 * hierarchy, optional supporting design layers), not a plain photo with one
 * caption on it — with nothing added after generation (no separate
 * compositor). So these principles cover the whole composition. */
export const AD_DESIGN_PRINCIPLES = `You are generating the ENTIRE finished ad as one real graphic-design poster, not a plain photo with a caption — nothing is added after you generate this, so every layer (background, photo, headline, any supporting design elements) must be rendered directly, in this one image. So:
- The headline is the dominant element the eye lands on first, but it sits inside a fully-designed composition: a considered background treatment (not just the photo stretched to fill the frame), the photo integrated as one element within it, and any supporting design layers arranged beneath the headline in a clear hierarchy — most important first, nothing competing with it for top billing.
- Default to a natural, slightly imperfect, authentic photographic style for the photo element itself — real environments, natural light, unposed body language — over glossy studio/stock-photo lighting, unless the brief specifically calls for a polished, styled look.
- If a person is in the photo, their gaze meets the camera directly for a TRUST/FEAR REMOVAL hook, or looks naturally toward the rest of the composition for an EMOTIONAL/ASPIRATIONAL hook.
- Commit clearly to the brand archetype's color mood (Step 3) across the whole composition — background, accents, and typography together — rather than defaulting to a washed-out, low-contrast, all-neutral look, unless the brand's own voice specifically calls for that muted look.`;

export const BRAND_VISUAL_ARCHETYPES = `Pick the ONE archetype that best matches this business's own words about itself — never default to the same one every time just because it's the safe choice:
- CLINICAL-CLEAN: crisp, precise, evidence-led. Cool light, minimal clutter, a sense of expertise.
- WARM-APPROACHABLE: reassuring, human, unhurried. Soft natural light, relaxed body language.
- LUXE-PREMIUM: considered, unhurried, high-end. Rich but restrained light, deliberate composition.
- BOLD-ENERGETIC: confident, direct, forward-moving. Higher contrast, more dynamic posture and angle.
- PLAYFUL: light, human, a little unexpected. Genuine expression over posed formality.

Test: the same big idea photographed through a LUXE-PREMIUM lens should look visibly different from the same idea shot BOLD-ENERGETIC. If two different archetypes would produce the same photo, the archetype isn't actually being applied.`;

/** How to lay out the full poster composition within one generated image,
 * per aspect ratio — there's no separate panel anymore, so this describes
 * where the photo integrates and where the design/text layers sit within
 * one frame, not a layout split between two rendered pieces. */
export function posterLayoutNote(aspectRatio: "1:1" | "4:5" | "9:16" | "16:9"): string {
  switch (aspectRatio) {
    case "9:16":
      return "This is a tall vertical frame — build it as a full poster: a designed background fills the frame, the photo is integrated as one element (commonly blended into the lower half with a soft edge, not a hard rectangular crop), the headline block sits in the upper third, any supporting design layers sit in the middle third, and a contact/CTA bar is pinned along the very bottom edge.";
    case "16:9":
      return "This is a wide frame — build it as a full poster: the photo is integrated on one side (commonly the right, blended with a soft edge into the background), the headline and any supporting design layers occupy the other side, and a contact/CTA bar runs along the bottom or the outer edge.";
    default:
      return "This is a portrait/square frame — build it as a full poster: the photo is integrated on one side (commonly the right, blended with a soft edge into the background, not a hard-edged rectangular crop), the headline block sits in the upper portion, any supporting design layers sit in the middle, and a contact/CTA bar is pinned along the very bottom edge.";
  }
}
