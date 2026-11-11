/**
 * Catches the specific fabrications the spec forbids (§7, §12.1): prices,
 * discounts, guest/size numbers. The prompt already forbids them; this is the
 * independent backstop — a hit makes the revision invalid, not published.
 *
 * Also the truth rules from docs/prodo-creative-knowledge.md §1 that apply to
 * Kangrooo: no urgency/scarcity (there is no offers data to back one), no "not an
 * ad" disguise, and no first-person testimonial (nobody may present a stay or an
 * event at a listing as their own experience — Kangrooo has no verified reviews).
 */
export const URGENCY_RULES: [RegExp, string][] = [
  [/\b(only|just)\s+\d+\s+(left|spots?|dates?|slots?|days?)\s*(left|remaining)?\b/i, "fake urgency"],
  [/\b(last chance|limited time|while (it|they|stocks?) lasts?|selling fast|filling (up )?fast|almost (fully )?booked|going fast|act now|hurry)\b/i, "fake urgency"],
  [/\b(offer|deal|sale|promo(tion)?)\s+ends\b|\bends\s+(today|tonight|tomorrow|soon|this week(end)?|on \w+day)\b/i, "fake urgency"],
  [/\bbefore it'?s (gone|booked|too late)\b/i, "fake urgency"],
];

export const AD_DISCLOSURE_RULES: [RegExp, string][] = [
  [/\bnot\s*an\s*ad\b|\bnot\s*sponsored\b|\bno(t)?\s*(a\s*)?paid\s*(promo(tion)?|partnership)\b/i, "ad disguise"],
];

export const TESTIMONIAL_RULES: [RegExp, string][] = [
  [/\b(i|we)\s+(just\s+)?(had|threw|hosted|celebrated|booked|held|stayed|rented|used)\s+(my|our|a|the|this|it|here)\b/i, "testimonial"],
  [/\bmy\s+(guests|party|wedding|event|birthday|team|shoot|workshop|celebration)\s+(loved|was|were|had)\b/i, "testimonial"],
  [/\b(best|greatest)\s+(night|party|event|day)\s+of\s+(my|our)\s+li(fe|ves)\b/i, "testimonial"],
];

export function findUnsupportedClaims(text: string): string[] {
  const hits: string[] = [];
  const rules: [RegExp, string][] = [
    [/[$€£]\s?\d/, "price"],
    [/\b\d+(\.\d+)?\s?%\s?(off|discount)/i, "discount"],
    [/\b(from|only|starting at)\s+\$?\d/i, "price"],
    [/\b\d{2,}\s*(guests?|people|persons|attendees|seats|pax)\b/i, "capacity"],
    [/\b(up to|capacity of|fits|seats)\s+\d+/i, "capacity"],
    [/\b\d{3,}\s*(sq\.?\s?ft|square (feet|foot)|sqft|m2|sq\.?\s?m)\b/i, "dimensions"],
    [/\b(per|an?)\s+(hour|night|day)\b.*\$|\$.*\b(per|\/)\s*(hour|hr|night|day)\b/i, "rate"],
    [/\b(5-star|five-star|award-winning|#1|best-rated)\b/i, "unsupported superlative"],
    ...URGENCY_RULES,
    ...AD_DISCLOSURE_RULES,
    ...TESTIMONIAL_RULES,
  ];
  for (const [re, label] of rules) if (re.test(text) && !hits.includes(label)) hits.push(label);
  return hits;
}
