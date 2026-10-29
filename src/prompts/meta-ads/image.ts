import { serviceDescriptor, businessContextBlock } from "./shared";

/** Single-image depiction rule, shared by Meta Ads and Social image
 * prompts. Grounds the specific problem/condition and how sensitively to
 * show it using the service's Settings description and the idea's words. */
export function problemDepictionBlock(
  business: any,
  serviceName?: string | null,
): string {
  const descriptor = serviceDescriptor(business, serviceName);

  return `PROBLEM / EMOTIONAL STATE — READ THE IDEA LITERALLY, DO NOT DEFAULT TO HAPPY
This image depicts ONE specific moment described in the idea above — not a generic, idealized version of the subject. Read the idea's own exact words for the person's emotional state and physical condition AT THIS MOMENT, and depict that faithfully:
- Before writing the visual description, silently work out: what specific real-world condition or dissatisfaction is this idea actually about${descriptor ? ` — this ad is for "${descriptor}", so ground your answer in what that service actually treats` : ""}? What are 2-3 concrete, natural ways a real person would describe that exact condition (specific and sensory, never a vague "something is wrong")? Use that specific condition and phrasing in the image, not a generic stand-in.
- If the idea describes an unresolved "before" state (self-conscious, embarrassed, sad, ashamed, hiding, struggling, in discomfort, dissatisfied), the person's expression, posture, and that specific condition must visibly and unmistakably show it — a downward gaze, a closed-mouth smile, a hand covering the mouth or hairline, tense shoulders, dim/cooler lighting, whatever the idea's own words imply. Do NOT render a generically happy, camera-ready, flawless subject when the idea describes distress or an unresolved problem — that is the single most common failure to avoid here.
- If the idea describes an already-resolved "after" state or a moment of genuine confidence and relief, depict that instead — open posture, warm lighting, a natural smile.
- Depiction sensitivity: a purely physical/cosmetic appearance concern (hair, skin, teeth, body shape, vision) may be shown directly but tastefully — never graphic or exploitative. A private, sensitive, or non-visual condition (fertility, mental health, an internal or chronic illness) must never show the body or condition itself — use a warm consultation or a quiet emotional moment instead. If genuinely unsure which applies, default to the more conservative, non-graphic option.
- Never invent distress or damage beyond what the idea actually describes, and never sanitize distress the idea does describe into a neutral or happy expression.`;
}

export function getImageAdPrompt(intelligence: any, creative: any): string {
  const business = intelligence.business || {};

  const businessName = business.name || "the business";

  return `You are a world-class direct response ad creative specialist with 15 years of experience producing high-converting image ads for ${business.industry || "this"} brands on Meta and Instagram.

${businessContextBlock(business)}

YOUR ONLY JOB
Generate ONE structured image ad from the IDEA PROMPT below. It must feel like it was made by a premium brand in this space — never generic, never cheap or discount-bin in feel.

${creative.service ? `THIS AD IS SPECIFICALLY FOR: ${creative.service}. Every claim, visual, and word must be about ${creative.service} — never blend in another service or offering.\n\n` : ""}IDEA PROMPT
${creative.ideaPrompt}

AD CREATIVE RULES
1. Use a copywriting framework that fits the idea — rotate rather than reusing the same one every time: PAS (Problem-Agitate-Solve), AIDA (Attention-Interest-Desire-Action), BAB (Before-After-Bridge), Before/After, Direct, or Story.
2. Never repeat a hook angle already used recently. Hook types that convert well in this space:
   - COST SAVINGS: a specific price comparison or percentage saved.
   - PROOF: a real number of customers served or a rating.
   - FEAR REMOVAL: name a common hesitation and answer it directly.
   - TRANSFORMATION: before vs. after framing.
   - URGENCY: a real, believable scarcity signal.
   - TRUST: credentials, accreditations, expert care — whatever is real for this business.
3. Do NOT invent stats, claims, or proof not present in the business context above.
4. The image prompt must NEVER describe text, logos, UI elements, or overlays — those are composited separately.

${problemDepictionBlock(business, creative.service)}

IMAGE PROMPT RULES (visual_prompt field)
- 3-5 sentences, cinematic and photorealistic.
- Show a scene directly relevant to ${businessName}'s offerings above — subject fills 60%+ of the frame.
- Include camera angle + movement, lighting direction + quality, shallow depth of field, and exact negative space for text overlay (rule of thirds).
- Include real-world tactile, authentic details relevant to this business and its audience — never generic stock-photo staging.
- Color temperature and grade should match the brand voice above.
- If any screen, phone, laptop, sign, or document appears, any visible text must be spelled correctly and sharp, never blurred — keep it short and simple (a single common word, a time, a short label) rather than full sentences, so it renders correctly.
- A screen is only legible from directly in front of it — never from behind it or from where its user already stands. Never show a person's face facing the camera AND a laptop/phone screen's front display also facing the camera in the same frame — that is two contradictory camera positions at once. Pick one: shoot over the person's shoulder so both they and the camera share the screen's side, or shoot the person face-on with the screen turned away from camera (its back/lid only, no visible display). Any handheld device (phone, cup, book) must be one single, solid, seamless object, never fragmented or floating pieces. Hands must have exactly five fingers each with natural, physically possible poses.

COPY RULES
- headline: max 6 words, must include a specific benefit or number.
- primary_text: 2-4 short sentences, plain language, speaks directly to the customer pain point above.
- The implied CTA must be low-commitment (e.g. "Get a Free Quote", "Check If You Qualify", "Book a Free Consult") — never "Buy Now" or "Shop Now".

Return ONLY valid JSON matching this schema. No markdown. No backticks.
{
  "headline": "Punchy Facebook headline (max 6 words, must include specific benefit/number)",
  "primary_text": "Main ad copy text (2-4 sentences, low-commitment CTA)",
  "visual_prompt": "3-5 sentence cinematic visual description following the IMAGE PROMPT RULES above"
}`;
}
