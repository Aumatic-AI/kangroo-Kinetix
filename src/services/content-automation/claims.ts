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

/**
 * Third-party characters and franchises seen in listing photos (party decorations,
 * cake toppers, arcade machines, art on the walls, films on screens). Naming one in a
 * plan or a Seedance prompt makes Kie's copyright audit reject the render ("the output
 * video may be related to copyright restrictions" — reproduced 2026-11-13 with a prompt
 * that only named Hello Kitty and Belle, no photos), and it would be third-party IP in a
 * Kangrooo post anyway. Not exhaustive: the planner prompt forbids every such name; this
 * catches the common ones deterministically.
 */
const FRANCHISE_RULES: RegExp[] = [
  /\bhello\s*kitty\b|\bsanrio\b|\bkuromi\b|\bmy\s*melody\b/i,
  /\bdisney\b|\bpixar\b|\bmickey\b|\bminnie\b|\bdonald\s+duck\b|\bgoofy\b/i,
  /\bfrozen\b(?!\s+(yogurt|drinks?|desserts?|treats?|cocktails?|margaritas?|food))|\belsa\b|\bolaf\b|\bmoana\b|\bencanto\b|\btoy\s+story\b|\bbuzz\s+lightyear\b|\blion\s+king\b|\bstitch\b(?!ed|ing|es)/i,
  /\b(princess\s+)?(belle|cinderella|ariel|rapunzel|aurora|jasmine)\b(?=.{0,40}\b(princess|disney|beast|topper|cake|costume|character|theme)\b)|\bbeauty\s+and\s+the\s+beast\b|\blittle\s+mermaid\b/i,
  /\bmarvel\b|\bspider[-\s]?man\b|\bavengers?\b|\biron\s*man\b|\bhulk\b|\bcaptain\s+america\b|\bbatman\b|\bsuperman\b|\bwonder\s+woman\b|\bdc\s+comics\b/i,
  /\bstar\s+wars\b|\bjedi\b|\bdarth\s+vader\b|\bharry\s+potter\b|\bhogwarts\b|\bpok[eé]mon\b|\bpikachu\b|\bnintendo\b|\bsuper\s+mario\b|\bsonic\s+the\b/i,
  /\bpaw\s+patrol\b|\bbluey\b|\bpeppa\s+pig\b|\bcocomelon\b|\bsesame\s+street\b|\bminions?\b|\bdespicable\s+me\b|\bshrek\b|\bthe\s+grinch\b|\bgrinch\b|\bsimpsons\b|\bspongebob\b|\bbarbie\b|\blego\b|\bkaws\b/i,
];

/** The franchise / character names a text mentions (empty when clean). */
export function findNamedFranchises(text: string): string[] {
  const hits: string[] = [];
  for (const re of FRANCHISE_RULES) {
    const m = text.match(re);
    if (m && !hits.includes(m[0].toLowerCase())) hits.push(m[0].toLowerCase());
  }
  return hits;
}

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
