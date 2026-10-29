/**
 * Outreach (cold email) prompts. Ported from the legacy Outreach app's n8n
 * GPT-4o-mini agent — one templated email per campaign, personalized per
 * recipient via merge tags at send time (not a distinct AI-written line
 * per lead — that was never how the legacy system worked either, see the
 * build guide's "what's deliberately not in v1" section).
 */

export interface OutreachBusinessContext {
  name: string;
  industry?: string | null;
  core_offerings?: string | null;
  business_voice?: string | null;
  target_audience?: string | null;
  website_url?: string | null;
}

const STRUCTURE_RULES = `Return ONLY valid JSON — no markdown, no commentary:
{
  "subject": "under 60 characters, reads like a personal email, never like a mass campaign",
  "body": "2-4 short paragraphs. Must include the literal merge tags {{firstName}} and {{companyName}} naturally in the opening line — these are Instantly's own personalization variables and are substituted automatically per recipient at send time, so never write a real name in their place. Never use ALL CAPS, never more than one exclamation mark in the whole email."
}`;

export interface OutreachDraftInput {
  goal: string;
  tone: string;
  messageBrief: string;
  serviceType: string;
  /** From the matching businesses.services[].description, if the business
   * filled one in — optional, gives the AI real grounding on what this
   * service means for this business instead of guessing from the name alone. */
  serviceDescription?: string | null;
  targetRegion: string;
  ctaText?: string;
  ctaLink?: string;
}

export function getOutreachDraftPrompt(
  business: OutreachBusinessContext,
  input: OutreachDraftInput
): { system: string; user: string } {
  // A separate, styled CTA button (this exact text) is appended after the
  // body automatically — the body itself must not restate it as its own
  // closing line, or the CTA visibly appears twice in the sent email.
  const ctaLine = input.ctaText
    ? `\n\nDo not write a call-to-action sentence, button text, or link in the body itself — a call-to-action button reading "${input.ctaText}" is appended automatically after the email. End the body on the sentence right before where that button would go (e.g. inviting them to take the next step), without naming the button text.`
    : "";
  return {
    system: `You are an expert cold-email copywriter for ${business.name}, a ${business.industry || "business"}.

What we offer: ${business.core_offerings || "Not specified"}
Target audience: ${business.target_audience || "Not specified"}
Service focus for this campaign: ${input.serviceType}${input.serviceDescription ? ` — ${input.serviceDescription}` : ""}
Target region: ${input.targetRegion}
Requested tone: ${input.tone}

Write a single cold outreach email. It must feel personally written, not templated or salesy. Never use spam-trigger words (free, guaranteed, act now, limited time, buy now). Never make claims not supported by the business context above.${ctaLine}

${STRUCTURE_RULES}`,
    user: `Goal: ${input.goal}\n\nWhat to say: ${input.messageBrief}`,
  };
}

export function getOutreachRevisionPrompt(business: OutreachBusinessContext, input: OutreachDraftInput, previousContent: unknown, feedback: string): { system: string; user: string } {
  const base = getOutreachDraftPrompt(business, input);
  return {
    system: base.system,
    user: `Here is the previous draft:\n${JSON.stringify(previousContent, null, 2)}\n\nThe user asked for this change: "${feedback}"\n\nRewrite the email, applying that feedback, following the same JSON schema.`,
  };
}
