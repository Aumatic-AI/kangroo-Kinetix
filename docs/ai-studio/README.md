# AI Studio — Chat-Based AI Image Generation System

## 1. What this is

A chat-based product feature: a user describes what they want in plain language, the system asks a small number of sharp, tailored clarifying questions, then generates **one finished, ready-to-use image directly** — no manual design step, no separate "decorate the photo afterward" step. The user can keep refining the result through natural-language edit requests, and every version ever generated stays visible in the session's history, so any earlier version can be picked again later, not just the most recent one.

It was first built for generating marketing images for a business, but the *architecture* — intake → dynamic questions → one rich prompt → direct image generation → chat-based editing → pick-and-finalize — has nothing marketing-specific about it. Section 12 explains exactly what to swap out to reuse it for a different kind of image-generation product entirely (product mockups, event graphics, social posts, presentation slides, anything where the end goal is "one AI-generated finished image"). Elements described below as "optional" really are optional — a use case with no persistent visual mark to place, no offer to highlight, or no contact line at all should simply skip those parts rather than force them in.

---

## 2. Why it's built this way

Every one of these decisions was arrived at by building the more "obvious" version first, watching it fail in a specific, observable way, and fixing that specific failure. They're listed here with the failure each one fixes, because the reasoning transfers even when the specifics don't.

### 2.1 Send ONE big, rich prompt straight to the image model — don't distill it through a text model first

The first version of this system worked in two stages: a text-reasoning LLM read a large context prompt (subject info, brief, strategy) and wrote a *short* image-generation prompt from it; only that short prompt was sent to the image model. This reliably produced weak, generic, watered-down output — the distillation step threw away the specificity that made the input good in the first place.

The fix: skip the distillation. Build one large, fully-detailed prompt (the whole context, the reasoning steps, the design rules, the copy rules) and send it **directly** to the image-generation model as its one input.

This only works if the image-generation model you pick can (a) actually follow a long, structured, multi-section instruction set, not just a one-line caption, and (b) render legible, correctly-spelled text directly onto the image it generates. Older image models were weak at both, which is *why* the two-stage approach and a deterministic compositing step (2.2) existed in the first place. Newer multimodal image models (the kind marketed specifically for "accurate text rendering" and strong instruction-following) close this gap — that capability shift is what makes this whole architecture viable. When you pick a model for this pattern, prioritize instruction-following and on-image text accuracy over raw photorealism; a gorgeous image that misspells its own headline is a failed generation.

### 2.2 Let the model generate the ENTIRE finished asset — don't composite text on afterward with code

The next version added a code-based "compositor": the image model generated a plain, textless photo, and a separate deterministic rendering step (an HTML/CSS-to-image renderer) drew a colored panel with the headline and any other fixed details on top of it. This existed specifically because image models used to be unreliable at rendering exact text.

It produced a flat, uninteresting result — "a photo with a caption card stuck next to it" — nothing like a real, professionally designed graphic. And it was *fighting* the model's own capability rather than using it: once the model can reliably render text (2.1), a separate compositing step is pure overhead that actively caps the visual quality.

The fix: remove the compositor entirely. Ask the image model to produce the **whole finished composition** — background treatment, integrated photo, headline, any supporting graphic elements — in one generation call, with nothing added afterward. This is a direct consequence of 2.1: you only get to delete the compositor once you trust the model with the text.

### 2.3 A human-in-the-loop clarifying-questions step is what prevents generic output

Pure automation — user types one idea, system generates one image, done — converges on generic, forgettable output almost every time, because a single vague sentence doesn't contain enough specific detail for the generation prompt to work with.

The fix is a **mandatory brief-collection step** that runs before generation: a separate text-reasoning LLM call (not the image model) reads the user's initial idea plus whatever context already exists, and generates a **small, tailored** set of follow-up questions — never a fixed checklist asked every time, never re-asking something the initial idea already answered, and always offering concrete, plausible suggested answers (not a blank text field) so answering takes seconds. This one step is what turns a generic idea into a specific brief the generation prompt can actually use.

### 2.4 Fabrication guardrails have to name the exact failure pattern, not just say "don't lie"

A generic instruction like "don't make up false claims" is not sufficient. Image/text models will default to whatever claim pattern is statistically common in their training data for a given category, even when told in general terms to be honest — because a plausible-sounding, category-typical claim doesn't feel like "making something up" to the model.

The fix that actually worked: identify the *specific* fabrication the model kept reaching for (a certain kind of number, a certain kind of claim) and forbid **that exact pattern by name**, in addition to the general rule. Generalize this for any project: wherever your generated content could include a specific number, statistic, date, or claim — (a) forbid it outright unless that exact figure is present in the real input data, and (b) if you can identify the specific plausible-sounding fabrication your model defaults to for this category, call it out explicitly as the thing not to do. A vague "be honest" instruction is not enough on its own.

### 2.5 Every generated version is kept forever; nothing is ever a locked "final" state

The first version of the finalize action locked the session and navigated the user away, so any earlier or alternate generated version became unreachable — if you generated three versions and finalized the third, there was no way back to the first or second.

The fix: every generated version is a permanent entry in the session's history (never deleted, never hidden), the user can pick **any** version — not just the latest — to be "the current output," and finalizing never locks anything: editing/chatting stays available indefinitely, before or after a version has been picked. Generalize this for any project: never destroy or hide a generated artifact once it exists; make "which one is currently the output" a pointer that can be reassigned at any time, not a one-way gate that ends the session.

---

## 3. The pipeline, step by step

```
 1. INTAKE            user gives: a subject/topic, a free-text idea,
                       optionally one reference image, an output aspect ratio
                              │
                              ▼
 2. DYNAMIC QUESTIONS  text-reasoning LLM call — reads the idea + context,
    (LLM: text model)  writes 4-7 tailored questions with suggested answers
                              │
                              ▼
 3. USER ANSWERS       small set of Q&A pairs (pick a suggestion or type
                       a free-text answer)
                              │
                              ▼
 4. GENERATION         ONE big prompt (context + idea + brief + reasoning
    (LLM: image model) steps + design rules + copy rules) sent DIRECTLY to
                       the image-generation model, together with any
                       reference images (a subject photo, and optionally
                       any other persistent visual asset the use case needs)
                              │
                              ▼
 5. REVIEW & ITERATE   user describes a change in plain language → that
    (LLM: image model) instruction + the CURRENT image (as an image input)
                       go back to the model with a "keep everything unless
                       mentioned, change only X" instruction → new version
                       appended to history. Repeatable indefinitely.
                              │
                              ▼
 6. FINALIZE           user picks ANY version (latest or earlier) as the
                       current output. Never locks the session.
```

Two, and only two, LLM call types exist in this whole system:

- **A text-reasoning model** — used exactly once per session, to generate the clarifying questions (step 2). It never touches the image itself.
- **An image-generation model** — used for every actual image (steps 4 and 5). It receives the full prompt text plus 0–N reference images and returns one image. It is never asked to return text, JSON, or commentary — only an image.

---

## 4. The visual/design system, explained

The output is modeled as a single composition made of **layers** — not because the image is literally built in layers by code (it isn't; the model renders all of it in one shot), but because describing it to the model as a layered design produces a properly composed graphic instead of a flat photo-with-caption. Each layer has a plain-language purpose and a rule for when it's allowed to appear. Every layer below marked "optional" should be left out entirely for use cases that don't need it — none of them are assumed defaults:

| Layer | Purpose | Rule |
|---|---|---|
| **Background** | A deliberately designed backdrop — a solid or gradient base color, optionally soft abstract accents — in the mood of the chosen visual archetype (see below). | Never just the photo stretched to fill the frame. |
| **Photo** | The actual generated scene/subject, proving the "big idea" (see below). | Integrated as *one element* of the composition — typically blended into one side/portion with a soft edge — not a hard rectangular photo pasted onto the background. |
| **Headline block** | The dominant piece of text — the single idea stated in a handful of words — plus, optionally, one shorter supporting line underneath. | Always present; this is the one piece of text the whole output depends on. Must be spelled exactly as decided and legible against its background. |
| **Value row** *(optional)* | A small row of 2-4 short, honest, generic value-prop badges (e.g. "Expert Support", "Fast Turnaround") — things genuinely true of this subject. | **Only if genuinely supported by real input data.** Never invented filler. Omit entirely if there's nothing real to put in it, or if your use case has no need for this at all. |
| **Offer/highlight box** *(optional)* | A distinct highlighted box or banner for a real, specific offer, discount, or promotion. | **Only if that exact offer/number/date is explicitly present in the real input data.** If no real offer exists, this layer is not drawn at all — never a placeholder or a category-typical guess. |
| **Bottom bar** *(optional)* | A colored strip carrying a call-to-action phrase and, if relevant, a contact/link line. | Never invent a phone number, handle, or URL that isn't on file. Skip entirely if this use case has no call-to-action concept at all. |
| **Persistent visual mark** *(optional)* | A recurring visual identifier — a logo, watermark, seal, or similar — if this use case has one. | Only if one actually exists and is provided as a reference image; never invented, never assumed. Many use cases have nothing like this at all, in which case this layer never appears. |
| **Accents** | Thin rule lines, dividers, small decorative motifs echoing the chosen archetype's mood. | Must be genuinely tied to this subject/brief — never an unrelated or invented decorative motif. |

Alongside the layers, three **reasoning frameworks** shape *what* the composition says before it's decided *how* it looks. These are generic persuasion/creative-strategy concepts, not tied to any single industry:

- **Desire type** — is the appeal functional (what it literally does), emotional (how it feels), or aspirational (who it makes the person)? Pick exactly one, based on what the brief actually supports.
- **Hook** — the one persuasion angle the piece leans on (cost savings, social proof, removing a specific fear/hesitation, before/after transformation, urgency, authority/trust, reciprocity, or identity/belonging). Pick exactly one — stacking hooks makes output feel like a manipulative checklist instead of one clean idea.
- **Visual archetype/mood** — a small set of named visual moods (clean & precise, warm & approachable, premium & considered, bold & energetic, playful) that should visibly change the lighting, composition, and color treatment of the whole piece, not just a label.

Full text for all three frameworks is in section 8.

---

## 5. The complete generation prompt

This is the single prompt sent directly to the image-generation model in step 4. Copy it whole — do not trim any section. `{{PLACEHOLDER}}` marks a variable to fill in from your own data; `[[IF condition]] ... [[ELSE]] ... [[/IF]]` marks a conditional block (include one branch, drop the tags). Any block marked optional below should be dropped entirely for use cases that don't need it.

````
You are a world-class creative director with deep experience producing high-converting marketing image content for {{INDUSTRY_OR_NICHE}} on {{PLATFORM_NAME}}.

CONTEXT: {{NAME, uppercase}}
- Category: {{industry_or_category}}
- Core offerings: {{core_offerings}}
[[IF a positioning/description exists]]- Positioning: {{positioning_description}}
[[/IF]]- Target audience: {{target_audience}}
- Customer pain points: {{pain_points}}
- Voice: {{voice}}

YOUR ONLY JOB
Generate ONE finished, ready-to-run poster-style image from the idea and brief below — directly, as the final output. There is no step after this one: whatever you generate IS the final asset, so it must include everything a real piece of marketing content needs (scene, headline text rendered on it, and identifying details where relevant), not just a plain uncaptioned photo. It must feel like it was made by a premium name in this space — never generic, never low-budget in feel.

Every choice you make — the hook, the desire type, the visual, the headline wording — must have a specific reason tied to this context and this brief. If you can't articulate why a choice beats the obvious alternative, pick a different choice.

HARD CONSTRAINT — NEVER INVENT A NUMBER
Do not put any number, percentage, price, or discount anywhere on this image unless that exact figure is written out, explicitly, in the context or brief below. {{CATEGORY}} marketing commonly uses generic claims like "{{a claim pattern this category commonly defaults to, if you know one — e.g. a stock percentage-off claim}}" — do NOT default to a claim like that just because it is a common pattern in this category; it is not true here unless the number appears explicitly above. If no real number exists in the context or brief, describe the benefit in plain words with zero numbers, prices, or percentages — this is the single most common mistake, and it makes the output false advertising, not just a style issue.

[[IF a specific offering/product/service was selected for this piece]]THIS PIECE IS SPECIFICALLY FOR: {{offering name (+ its own description, if any)}}. Every claim and visual must be about this offering — never blend in another.

[[/IF]]IDEA
{{the user's free-text description of what they want}}
[[IF a reference image was provided]]
A reference photo is attached alongside this prompt — the user wants this image to genuinely resemble it. Look at what it shows (the scene, the subject, any real detail it depicts) and use that as the actual basis for the scene you generate, not just a loose mood board. If the idea above describes what the reference contains, treat that description as literal instruction for what the image should show.
[[/IF]]
BRIEF (the user's answers to your own clarifying questions)
{{Q&A pairs, formatted as "Q: ...\nA: ..." joined with blank lines — or, if none were answered: "(no answers given — use your judgement based on the idea and context alone)"}}

[[IF you have real historical performance data to draw on — OMIT this whole section if you don't]]
=== HISTORICAL PERFORMANCE ===
Current winning angle: {{summary of what's been working, or "Not enough data yet — no live-performance history available."}}
{{any concrete directives learned from past performance, each as a bullet, followed by: "You MUST follow these directives or the output will fail." — or, if none: "No live-performance directives yet — rely on the brief and market data instead."}}

{{IF a specific hook formula is known to work well from market research: "PROVEN HOOK FORMULA FROM MARKET DATA: {{formula}}"}}
[[/IF]]
STEP 1 — THE BIG IDEA (decide this before anything else)
Decide the ONE thought this entire piece is built around — the single idea that the headline and the scene both prove from different angles, instead of each doing its own separate thing.

Test it: if you could swap this piece's headline and scene into a totally different, unrelated piece and nobody would notice, there is no big idea yet — just decoration. For example:
- WEAK, no big idea: a generic headline next to a generic, stock-feeling photo. Neither is specific to this context or this brief — either could belong to any piece on earth.
- STRONG, one big idea: the brief describes a specific real tension or insight. The big idea names that tension in one sentence. The headline and the scene both now prove that same one idea, from different angles.

STEP 2 — DESIRE TYPE AND HOOK
Pick exactly ONE desire type for this piece, based on what the brief actually supports — never default to emotional automatically:
- FUNCTIONAL: what the thing literally does.
- EMOTIONAL: how it feels.
- ASPIRATIONAL: who it makes the person — the version of themselves they want to be seen as.

Read the self-performance data before choosing a style (skip this if you have none):
- Angle barely used yet: a direct claim is fine — state the benefit plainly.
- Angle already run several times: lead with a NEW mechanism or reason instead of repeating the same claim.
- Angle clearly worn out: drop the claim entirely and rely on a pure feeling/identification image — no explicit pitch at all.

Hook types available — pick exactly ONE, never stack more than one, or the piece starts to feel like a manipulative checklist instead of one clean idea:
- COST SAVINGS: a specific price comparison or percentage saved.
- PROOF (persuasion lever: social proof): a real number served or a rating.
- FEAR REMOVAL: name a common hesitation and answer it directly.
- TRANSFORMATION: before vs. after framing.
- URGENCY (persuasion lever: scarcity): a real, believable scarcity signal.
- TRUST (persuasion lever: authority): credentials, accreditations, expertise — whatever is real here.
- RECIPROCITY (persuasion lever: reciprocity): lead with something genuinely free/given first before asking for anything.
- UNITY / BELONGING (persuasion lever: unity): frame the offer around identity or group, not just the outcome.

Never invent fake scarcity, fake numbers, or fake testimonials to force a hook to fit — if the context doesn't honestly support a lever, pick a different one instead.

Do NOT invent stats, claims, or proof not present in the context, brief, or performance data above.

STEP 3 — VISUAL IDENTITY (derive this, then stay consistent with it)
This context's own described voice — "{{voice}}", category: {{industry_or_category}}, description: "{{description}}".

From that, pick ONE visual archetype — never default to the same one every time just because it's the safe choice:
- CLEAN & PRECISE: crisp, evidence-led. Cool light, minimal clutter, a sense of expertise.
- WARM & APPROACHABLE: reassuring, human, unhurried. Soft natural light, relaxed body language.
- PREMIUM & CONSIDERED: unhurried, high-end. Rich but restrained light, deliberate composition.
- BOLD & ENERGETIC: confident, direct, forward-moving. Higher contrast, more dynamic posture and angle.
- PLAYFUL: light, human, a little unexpected. Genuine expression over posed formality.

Test: the same big idea photographed through a PREMIUM & CONSIDERED lens should look visibly different from the same idea shot BOLD & ENERGETIC. If two different archetypes would produce the same image, the archetype isn't actually being applied.

The scene's lighting, setting, and mood must match that archetype — this is what makes the output look distinct and specific, not a generic version of the category. If the brief above already states a photo-style preference (e.g. candid/natural vs. polished/magazine-style), that preference overrides the archetype's default look.

STEP 4 — THE COMPOSITION (this is a real graphic-design piece, not a photo with a caption underneath — nothing is drawn on afterward)
This must look like a professionally designed marketing poster/graphic — a full composition with a designed background, an integrated photo, and layered text/design elements — never just a plain photo with one line of text floating on it or pasted below it. Build it from these layers, using your own design judgement for what this specific context/brief actually supports — treat any layer below as fully optional if it doesn't apply:
- BACKGROUND: a deliberately designed background in the chosen archetype's color mood — a solid or gradient base color, optionally with subtle graphic accents (soft color washes, abstract shapes, a faint thematic motif that is genuinely relevant to this context or brief) — never just the photo stretched to fill the whole frame.
- PHOTO: the scene from Steps 1-3 is integrated as ONE element of this composition — typically blended into one side of the frame with a soft, natural edge, not a hard rectangular photo pasted onto the background — leaving the rest of the canvas for the design elements below.
- HEADLINE BLOCK: the headline (COPY RULES below) as the dominant typographic element, plus — only if it strengthens the message — one shorter supporting line in a different weight or style beneath it.
- VALUE ROW (only if genuinely supported by the context/brief — omit entirely otherwise): a small row of 2-4 short icon-and-label badges for honest, generic value props that are genuinely true here — never a statistic, never invented filler.
- OFFER BOX (only if a real offer exists — omit entirely otherwise): if — and only if — the context or brief explicitly states a real offer, discount, or promotion with its actual number or date, render it as a distinct highlighted box or banner using that exact figure.
- BOTTOM BAR (only if a call-to-action or contact line is relevant to this use case — omit entirely otherwise): a colored strip or bar along one edge (commonly the bottom) carrying the CTA phrase and, if available, a contact line — never invent a contact detail.
- ACCENTS: thin rule lines, dividers, or small decorative motifs that echo the archetype's mood and are genuinely tied to this context or brief — never an unrelated or invented decorative motif.

[[IF this use case has a persistent visual mark on file (a logo, watermark, seal, or similar) — otherwise omit this line entirely, don't mention it either way]]A reference image of that mark is attached alongside this prompt (in addition to any reference photo above — visually distinguish them: a mark like this typically reads as a graphic or wordmark, not a photograph). Incorporate it into the composition only if it genuinely fits this specific piece: small, unobtrusive, correctly proportioned, never stretched or distorted. Skip it if it would clash — don't force it into every piece.[[/IF]]
[[IF contact info is on file and a bottom bar is relevant to this use case]]If a direct-response contact line genuinely strengthens this specific piece's message, you may render it directly and legibly into the bottom bar: "{{contact text}}". Skip it if it reads better without it.[[/IF]]

BEFORE/AFTER TRANSFORMATION — only if the brief above genuinely asks for one
If the brief indicates the user wants a before/after comparison shown, that comparison IS the photo element of this composition, not a small addition to a normal scene — design it deliberately: a soft diagonal or curved dividing line rather than a plain hard vertical/horizontal split, matched framing/angle/lighting across both sides so the comparison reads instantly at a glance, and — only if it genuinely helps and stays small and unobtrusive — subtle labels distinguishing the two sides. The headline should reinforce this transformation, not just repeat what's already visually obvious. If the brief does not ask for a before/after, do not add one on your own initiative.

You are generating the ENTIRE finished piece as one real graphic-design composition, not a plain photo with a caption — nothing is added after you generate this, so every layer (background, photo, headline, any supporting design elements) must be rendered directly, in this one image. So:
- The headline is the dominant element the eye lands on first, but it sits inside a fully-designed composition: a considered background treatment (not just the photo stretched to fill the frame), the photo integrated as one element within it, and any supporting design layers arranged beneath the headline in a clear hierarchy — most important first, nothing competing with it for top billing.
- Default to a natural, slightly imperfect, authentic photographic style for the photo element itself — real environments, natural light, unposed body language — over glossy studio/stock-photo lighting, unless the brief specifically calls for a polished, styled look.
- If a person is in the photo, their gaze meets the camera directly for a TRUST/FEAR REMOVAL hook, or looks naturally toward the rest of the composition for an EMOTIONAL/ASPIRATIONAL hook.
- Commit clearly to the archetype's color mood (Step 3) across the whole composition — background, accents, and typography together — rather than defaulting to a washed-out, low-contrast, all-neutral look, unless the described voice specifically calls for that muted look.

{{LAYOUT NOTE FOR THE CHOSEN ASPECT RATIO — see section 8.4 for the per-ratio text}}

COPY RULES — every piece of text below must be rendered directly and legibly, spelled exactly as decided here
- Headline: max 6 words, a specific concrete benefit. Only include a number or percentage if one is explicitly present in the context or brief above — if none exists, describe the benefit in words instead. Never invent a percentage, price, or statistic that isn't explicitly present above; that is a hard rule, not a style choice.
- Optionally, one short supporting line (roughly 4-8 words) beneath the headline if it genuinely strengthens the message — a plain-spoken follow-on, not a repeat of the headline.
- Value-row badge labels (only if the VALUE ROW above applies): 1-3 words each, generic and honest — never a statistic, never invented.
- Offer box text (only if the OFFER BOX above applies): use the exact real number/date from the context or brief — never a placeholder or a category-typical figure.
- CTA text in the bottom bar (only if a bottom bar applies): a short, low-commitment call to action — never a hard-sell "Buy Now"-style push unless the brief specifically calls for a direct-purchase CTA, and never mention a price unless that price is explicitly given above.
- The photo/scene: 3-5 sentences worth of detail, cinematic and photorealistic, following the design principles above. It must specifically prove the big idea from Step 1 — not just something generically relevant to {{NAME}}.

If any screen, phone, laptop, sign, or document appears within the photo element, it must show no readable text at all (blurred, angled away, or turned off) — every piece of on-image text in this piece must be one you deliberately chose above, never an uncontrolled extra source of text inside the photo itself. A screen is only legible from directly in front of it — never show a person's face facing the camera AND a screen's front display also facing the camera in the same frame. Any handheld object must be one solid, seamless shape. Hands must have exactly five fingers each with natural, physically possible poses.

Before generating, make sure:
- This looks like a real designed poster — a background treatment, an integrated photo, and layered text — not a plain photo with one caption on it.
- Every piece of text is spelled correctly and legible against its background.
- No fabricated number, percentage, price, or date appears anywhere in the image — not in the headline, not in a value badge, not in an offer box. If a layer has nothing real to show, it isn't drawn at all.
- The scene matches the archetype from Step 3, not a generic version of the category.
- If a reference photo is attached, the scene actually reflects what it shows, not just a loosely-related scene.
- If a persistent visual mark is attached, it appears undistorted and only if it genuinely fits — never forced in.

Now generate that one finished image directly.
````

### 5.1 Reference images sent alongside this prompt

Pass these as image inputs to the same generation call, not as separate calls:

- `[[IF a user-provided reference image exists]]` the reference photo the user attached.
- `[[IF this use case has a persistent visual mark on file]]` that asset's own image file — entirely optional; most use cases won't have one.

Most modern multimodal image APIs accept multiple reference images per call (check your provider's limit — commonly up to 10-14). There is usually no way to *label* which attached image is which inside the API itself — that's why the prompt text above describes them in words (e.g. "typically reads as a graphic or wordmark, not a photograph") so the model can tell them apart visually. Order doesn't meaningfully matter; description does.

---

## 6. The complete edit prompt

Used in step 5 (review & iterate). Sent together with the *current* image as the one reference input.

````
This exact reference image is the starting point. Apply the following change to it completely and precisely — follow it exactly as written, whether that means a small tweak or a substantial change to the scene. Do not do it halfway, and do not hold back if the instruction genuinely calls for a bigger change:

{{THE USER'S EDIT INSTRUCTION, VERBATIM}}

Rules:
- Carry out the instruction above fully and correctly — nothing about it is off-limits (new objects, text, people, or a different setting are all fine if the instruction calls for them).
- Do not change anything the instruction above doesn't ask for or doesn't require — the subject, framing, background, lighting, and every other detail it doesn't mention must stay exactly as it is in the reference image.
- Never invent extra changes on your own initiative beyond what's needed to carry out the instruction above.
````

This prompt is already fully generic as written — no placeholders needed beyond the instruction itself. The key design point: it explicitly names *both* failure directions (doing the edit halfway, and over-editing things that weren't mentioned) rather than only warning about one of them.

---

## 7. The complete dynamic-questions prompt

Used in step 2, sent to the **text-reasoning model**, not the image model. This is the only LLM call in the whole system that is allowed to return structured text/JSON instead of an image.

````
You are a senior creative strategist about to plan one piece of marketing image content. The questions you write go straight to someone who is not a marketer — every question must be something they can read and answer in seconds, in their own plain language.

CONTEXT: {{NAME, uppercase}}
- Category: {{industry_or_category}}
- Core offerings: {{core_offerings}}
[[IF a positioning/description exists]]- Positioning: {{positioning_description}}
[[/IF]]- Target audience: {{target_audience}}
- Customer pain points: {{pain_points}}
- Voice: {{voice}}
[[IF a specific offering was selected]]
THIS PIECE IS FOR: {{offering name (+ description)}}
[[/IF]]
THE USER'S IDEA
{{the user's free-text description}}
[[IF a reference image was provided]]
The user also attached a reference photo of their own (a place, product, or setting) to use as the basis for this piece's design.
[[/IF]]
[[IF this use case has any optional persistent visual mark or contact info on file]]This context {{"has [a mark] on file" or "has no [mark] on file"}} and {{"has contact info on file" or "has no contact info on file"}} — relevant to guideline 6 below.[[/IF]]

YOUR PRIVATE ANALYSIS — for your own reasoning only, never mention any of these terms or this framework to the user
Pick exactly ONE desire type for this piece, based on what the brief actually supports — never default to emotional automatically:
- FUNCTIONAL: what the thing literally does.
- EMOTIONAL: how it feels.
- ASPIRATIONAL: who it makes the person — the version of themselves they want to be seen as.

Read the self-performance data before choosing a style (skip if you have none):
- Angle barely used yet: a direct claim is fine — state the benefit plainly.
- Angle already run several times: lead with a NEW mechanism or reason instead of repeating the same claim.
- Angle clearly worn out: drop the claim entirely and rely on a pure feeling/identification image — no explicit pitch at all.

Hook types available:
- COST SAVINGS, PROOF (social proof), FEAR REMOVAL, TRANSFORMATION (before/after), URGENCY (scarcity), TRUST (authority), RECIPROCITY, UNITY/BELONGING.

HOW TO WRITE THE QUESTIONS
1. First, silently list everything the idea above already tells you — the audience, the problem, the feeling, any offer, any specific detail. Never turn any of that into a question. For example, if the idea already says "show the shift from struggling with X to feeling confident", that already IS the transformation and the tone — never ask "what tone do you want" or "what transformation should we show," that's already answered. Only ask about something that is genuinely still missing.
2. Write every question in plain, everyday words a non-marketer would use — NEVER use any term from your private analysis above (never say "sophistication," "angle," "desire type," "hook," "mechanism," "self-performance," or similar). Ask about the real thing directly instead: say "What's the one feeling you want people to walk away with?" not "What desire type should we target?"
3. Usually 4-7 questions; fewer if the idea is already detailed, more only if it's very vague.
4. For EVERY question, give 3-4 short, concrete, realistic answer options they could plausibly pick for THIS specific context and idea — never generic placeholders like "Option A". They can still type their own answer instead, so these are helpful suggestions, not the only allowed values.
5. If nothing above already tells you the preferred photo style, include one plain-language question about it — e.g. "Do you want the photo to feel more like a real moment (candid, natural) or more like a magazine-style shot (polished, styled)?" — so the same context can set this once and get a consistent look across pieces.
6. [[IF this use case has any optional persistent visual mark or contact info concept at all — otherwise delete this guideline entirely]] If the idea above doesn't already say whether to include that mark or contact info (and one of them is actually on file, per the note above), you MAY ask about it — but only when you genuinely think it would improve this specific piece. Never ask this routinely just because the option exists — most pieces don't need it asked every single time.
7. If this offering is the kind that has a genuine visual before/after (results-based services, physical transformations, renovations, restorations — anything where "before" and "after" are visually distinct) and the idea above doesn't already make clear whether to show one, you MAY ask a plain question about it — e.g. "Want this piece to show a before/after comparison?" with options like "Yes, show before/after", "No, just show the result". Never ask this for something where a before/after wouldn't make visual sense — skip it entirely for those.

OUTPUT FORMAT
Return ONLY valid JSON. No markdown, no commentary.
{
  "questions": [
    { "id": 1, "question": "...", "options": ["short concrete option", "another realistic option", "a third option"], "placeholder": "short example custom answer" }
  ]
}
````

Note the asymmetry with sections 5 and 6: this is the *one* prompt in the system sent to a text-reasoning model instead of the image model, and the *one* place a JSON output schema is appropriate — because this call's whole job is producing structured data (a question list), not an image.

---

## 8. Reusable reasoning frameworks (reference)

These are the standalone "knowledge blocks" referenced by sections 5 and 7 above. Keep them in one place in your own codebase (not copy-pasted inline into every prompt) so a change to the reasoning updates every prompt that uses it.

### 8.1 Desire types
Pick exactly ONE, based on what the brief actually supports — never default to emotional automatically:
- **FUNCTIONAL** — what the thing literally does.
- **EMOTIONAL** — how it feels.
- **ASPIRATIONAL** — who it makes the person; the version of themselves they want to be seen as.

### 8.2 Hook types
Pick exactly ONE — never stack more than one:
- **COST SAVINGS** — a specific price comparison or percentage saved.
- **PROOF** (lever: social proof) — a real number served or a rating.
- **FEAR REMOVAL** — name a common hesitation and answer it directly.
- **TRANSFORMATION** — before vs. after framing.
- **URGENCY** (lever: scarcity) — a real, believable scarcity signal.
- **TRUST** (lever: authority) — credentials, accreditations, expertise.
- **RECIPROCITY** (lever: reciprocity) — lead with something genuinely free/given first.
- **UNITY / BELONGING** (lever: unity) — frame around identity or group, not just outcome.

Never invent fake scarcity, numbers, or testimonials to force a hook to fit — if the real context doesn't honestly support a lever, pick a different one.

### 8.3 Visual archetypes
Pick the ONE that best matches the context's own described voice — never default to the same one every time:
- **CLEAN & PRECISE** — crisp, evidence-led. Cool light, minimal clutter.
- **WARM & APPROACHABLE** — reassuring, human, unhurried. Soft natural light.
- **PREMIUM & CONSIDERED** — unhurried, high-end. Rich but restrained light.
- **BOLD & ENERGETIC** — confident, direct, forward-moving. Higher contrast.
- **PLAYFUL** — light, human, a little unexpected. Genuine expression over posed formality.

### 8.4 Layout note, per aspect ratio
Describes where the photo integrates and where the text/design layers sit within one frame — there's no separate rendered panel, this is guidance for negative space within a single composition:

- **Tall/vertical (e.g. 9:16):** "This is a tall vertical frame — build it as a full poster: a designed background fills the frame, the photo is integrated as one element (commonly blended into the lower half with a soft edge, not a hard rectangular crop), the headline block sits in the upper third, any supporting design layers sit in the middle third, and a bottom bar (if relevant) is pinned along the very bottom edge."
- **Wide/landscape (e.g. 16:9):** "This is a wide frame — build it as a full poster: the photo is integrated on one side (commonly the right, blended with a soft edge into the background), the headline and any supporting design layers occupy the other side, and a bottom bar (if relevant) runs along the bottom or the outer edge."
- **Portrait/square (e.g. 1:1, 4:5):** "This is a portrait/square frame — build it as a full poster: the photo is integrated on one side (commonly the right, blended with a soft edge into the background, not a hard-edged rectangular crop), the headline block sits in the upper portion, any supporting design layers sit in the middle, and a bottom bar (if relevant) is pinned along the very bottom edge."

---

## 9. Data model (generic, storage-agnostic)

You don't need this exact schema — any storage layer works — but the *concepts* below are load-bearing; skipping one tends to reintroduce one of the failures in section 2.

**Session** — one per "thing the user is trying to create":
- a subject/topic label, the free-text initial idea, the chosen aspect ratio/size
- an optional reference image
- the Q&A brief (once answered) — a list of `{question, answer}` pairs
- a status (roughly: collecting brief → awaiting answers → generating → reviewing) — importantly, **there is no terminal "locked" status**; reviewing is the steady state forever, even after something has been finalized
- a pointer to whatever "current output" record this session is linked to (see below)

**Message / history entry** — one per turn in the chat, in chronological order, **never deleted**:
- role (user/assistant), kind (plain text / the question form / a generated image)
- for an image entry: just the image URL — nothing else needs to travel with it once section 2.2's decision is made (no separate headline/body-copy fields to keep in sync, because the model rendered all of that text directly into the image itself)

**Output/library record** — the thing that actually gets used downstream (e.g., "the published piece," "the final asset"):
- points at whichever image is *currently* chosen as the output — reassignable at any time, from any message in the history, not just the latest
- finalizing/publishing this record never changes the session's own state — the session stays fully editable

The important invariant, stated once so it doesn't get lost: **the message history is the only source of truth for "what images exist"; the output record is just a movable pointer into it.** Never let "which image is the output" and "which images exist" become the same piece of state.

---

## 10. Integration requirements for the image-generation API

Whatever provider/model you pick needs to support, at minimum:

1. **One long text prompt as input** — hundreds of words, multiple sections. Reject any API that only accepts a short caption-style prompt; it can't carry the reasoning steps in section 5.
2. **Zero to several reference images per call** — for the user's own reference photo and, optionally, any other persistent visual asset the use case needs, sent together in one call (see section 5.1). Confirm your provider's actual limit and image-format requirements.
3. **A selectable output aspect ratio / resolution.**
4. **Reliable on-image text rendering** — this is the single most important model-selection criterion for this whole architecture (see section 2.1). Test this specifically before committing to a model: generate a piece with a short, specific headline and confirm it comes back spelled correctly and legible, not garbled or approximated.
5. **An async job pattern (create → poll for status → fetch result)** is typical for these providers and works fine — nothing in this architecture requires a synchronous image response.

---

## 11. Common pitfalls (learned the hard way)

- **Two-stage generation (text model distills a prompt → image model executes it) quietly produces worse output than one rich prompt sent directly.** If output feels generic, check whether something in the pipeline is summarizing/shortening the prompt before it reaches the image model.
- **Models default to plausible, category-typical fabricated claims** even when told generally to be honest. A specific, named "don't do X" (section 2.4) works where a generic "don't lie" doesn't.
- **Multiple reference images in one call have no built-in labels.** If you're sending more than one (e.g. a subject photo plus some other visual asset), the prompt text has to describe how to visually tell them apart, or the model may not use them the way you intend.
- **Every optional design element needs an explicit "omit if not genuinely supported" rule**, or the model fills it with plausible-sounding filler instead of leaving it out. This applies to anything decorative-but-informational: badges, callout boxes, stat lines, taglines.
- **"Finalize" must never be a one-way gate.** The instant a generated artifact becomes unreachable (locked session, deleted history, forced navigation away), you lose the ability to go back to a better earlier version — and users will ask for exactly that.
- **A Fragment (or equivalent) as the direct children of a layout container, in some server-side rendering-to-image tooling, can silently drop one of the children from the render.** Not relevant once section 2.2's compositor is removed, but worth knowing if any deterministic rendering step is ever reintroduced for some other purpose.

---

## 12. Adapting this to a different domain

The pipeline in section 3, the layer system in section 4, and the data model in section 9 are the reusable core — they don't assume marketing, advertising, or any particular industry. What's swappable:

- **Section 8's reasoning frameworks** (desire types, hooks, archetypes) are a *marketing/persuasion* reasoning layer. If your new use case isn't marketing at all — say, generating event posters, book covers, or presentation slide art — replace section 8 with whatever domain reasoning actually fits (e.g., for a book cover: genre conventions, mood, typography-era). The *shape* stays the same: a small number of named categories, each described in one or two sentences, with a "pick exactly one, and be able to justify it" rule.
- **Section 4's layer list** (background/photo/headline/value row/offer box/bottom bar/persistent mark/accents) is specific to "poster-style marketing image," and every layer past the first three is already explicitly optional — a different output type will have a different, but similarly small, set of named layers; define them the same way: what it is, why it exists, and the exact rule that gates whether it appears.
- **Section 2.4's fabrication guardrail** generalizes to *any* domain where the output could state a fact, number, or claim — swap in whatever the specific plausible-fabrication pattern is for your domain.
- Everything else — send one big prompt directly to the image model, let it render the whole composition, run a dynamic-questions step first, keep full version history, never lock the session — carries over unchanged.
