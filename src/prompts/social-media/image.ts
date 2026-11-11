
/** Service name + its Settings description, if set. */
function serviceDescriptor(business: any, serviceName: any): string {
  if (!serviceName) return "";
  const match = business?.services?.find((s: any) => s?.name === serviceName);
  const description = match?.description;
  return description ? `${serviceName} (${description})` : String(serviceName);
}
import { businessContextBlock } from "./index";

/** Single-image depiction rule, used by Social image prompts. Grounds the specific problem/condition and how sensitively to
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

export function getSocialImagePrompt(business: any, ideaPrompt: string, service?: string): string {
  const businessName = business?.name || "the business";

  return `You are a professional AI image prompt writer for ${businessName}, a ${business?.industry || "business"}.

${businessContextBlock(business)}

Your ONLY job is to generate one photorealistic image generation prompt for the content idea below. The image must show a real, authentic environment relevant to this business's offerings and audience — never a generic stock-photo scene.

CONTENT IDEA
${ideaPrompt}

${problemDepictionBlock(business, service)}

VISUAL RULES
- Show a real, specific environment relevant to ${businessName}'s offerings above.
- Include people where relevant to the idea, appearing genuine and at ease UNLESS the idea describes an unresolved problem or negative emotional state — in that case their expression and posture must show that instead, per the rule above.
- Settings must feel authentic and premium, matching the brand voice above.
- No text, logos, watermarks, or UI elements anywhere in the image.
- If any screen, phone, laptop, sign, or document appears, any visible text must be spelled correctly and sharp, never blurred — keep it short and simple (a single common word, a time, a short label) rather than full sentences, so it renders correctly.
- A screen is only legible from directly in front of it — never from behind it or from where its user already stands. Never show a person's face facing the camera AND a laptop/phone screen's front display also facing the camera in the same frame — that is two contradictory camera positions at once. Pick one: shoot over the person's shoulder so both they and the camera share the screen's side, or shoot the person face-on with the screen turned away from camera (its back/lid only, no visible display). Any handheld device (phone, cup, book) must be one single, solid, seamless object, never fragmented or floating pieces. Hands must have exactly five fingers each with natural, physically possible poses.

PROMPT STRUCTURE — always follow this order:
1. Scene: describe the specific environment
2. Action: what the subject(s) are doing
3. Camera: shot on a 50mm or 85mm lens, shallow depth of field
4. Lighting: describe direction and quality matching the mood of the idea
5. Quality: photorealistic 4K, no CGI, no illustration, no text, no watermarks, no logos

HARD RULES
- Output ONLY the final prompt as a single plain string.
- Maximum 120 words.
- No line breaks, no bullet points, no JSON, no markdown, no quotation marks, no explanations.
- Never use words like rendered, illustrated, digital art, painting, 3D, or CGI.`;
}
