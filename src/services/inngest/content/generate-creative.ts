import { LINKEDIN_TEXT_IMAGE_SUFFIX, TEXT_CHECK_PROMPT, TEXT_CHECK_SYSTEM, parseTextRead, verifyRenderedText } from "@/services/content-automation/image-text";
import { END_CARD_SECONDS, END_CARD_VERSION, VIDEO_FORMAT, VIDEO_HEIGHT, VIDEO_RESOLUTION, VIDEO_TOTAL_SECONDS, VIDEO_WIDTH } from "@/services/content-automation/video-spec";
import { SEEDANCE_MODEL } from "@/services/ai/providers/kie";
import { aiOrchestrator } from "@/services/ai/orchestrator";
import { FFmpegService } from "@/services/ffmpeg";
import { submitBrandVideoJob, submitFrameGridJob } from "@/services/content-automation/ffmpeg-remux";
import { checkSocialMedia, type PlatformChecks } from "@/services/content-automation/platform-specs";
import { buildSocialPosts, buildLinkedInPost, copyErrors } from "@/services/content-automation/platform-copy";
import type { MediaProbe, VideoProbe } from "@/services/content-automation/media-probe";
import {
  parseAgentJson, socialAgentSchema, linkedinAgentSchema, validateRevisionContent,
  type SocialAgentOutput, type LinkedInAgentOutput,
} from "@/services/content-automation/agents";
import {
  MIN_NAMED_DETAILS, VIDEO_MAX_NARRATION_WORDS, VIDEO_MIN_NARRATION_WORDS, assignSlotCreative, assignmentMismatches, findRepeatedHook,
  peopleRule, VOICE_MOODS, type PeopleMode, type SlotCreative, type VoiceMood,
} from "@/services/content-automation/strategy";
import {
  MAX_BRIEF_REVISIONS, MAX_MEDIA_ATTEMPTS, briefFeedback, briefReviewSchema, decideMediaReview, mediaReviewSchema, mediaReviewUnavailable, scoreBrief,
  type BriefReview, type MediaReview,
} from "@/services/content-automation/qa";
import { addDays, mondayOf, validateProposedSchedule, type PlannedPost, type ProposedSlot } from "@/services/content-automation/schedule";
import {
  getSocialAgentPrompt, getLinkedInAgentPrompt, getSchedulePrompt, getBriefReviewPrompt, getMediaReviewPrompt, getNarrationWriterPrompt,
  type PropertyFacts, type BusinessFacts, type CreativeHistory,
} from "@/prompts/content-automation";
import { supabase, rpc, storeRemoteMedia, withLogo, ensureVideoLogo, ensureEndCard, kieResultUrl, keepAlive, isPermanentError, PermanentGenerationError, SOCIAL_PLATFORMS, type Step } from "./shared";
import { generateBlog } from "./generate-blog";

/**
 * The shared generation pipeline behind both a queue job (weekly / manual
 * trigger) and a gallery regeneration. It only ever writes to the gallery
 * tables (property_content / content_revisions / content_clips / media_assets):
 * it never creates a social_posts row and never calls a publishing service, so
 * nothing generated here can reach a social account.
 */

export interface CreativeParams {
  mode: "job" | "regen";
  businessId: string;
  propertyId: string;
  pipeline: "social" | "linkedin" | "blog";
  cycleId: string | null;
  environment: "testing" | "live";
  queueId?: string;
  /** The job's position in its cycle (pipeline + slot_index) — how it finds its slot in the week plan. */
  slotIndex?: number;
  worker?: string;
  contentId?: string;
  revisionId?: string;
  guidance?: string | null;
  forceType?: "image" | "video" | null;
}

type Plan = { kind: "social"; data: SocialAgentOutput } | { kind: "linkedin"; data: LinkedInAgentOutput };

interface Loaded {
  property: PropertyFacts & { timezone: string | null };
  imageUrls: string[];
  business: BusinessFacts;
  timezone: string;
  weekStart: string;
}

const VIDEO_SUFFIX = "\nUse the provided reference photos as the real venue and keep it faithful to them: same layout, furniture, materials and light. Do not invent amenities, rooms, views, text overlays, logos, prices or signage. Portable event props (balloons, a cake, laptops) are fine; venue fixtures or equipment the photos don't show are not.";
const MAX_TEXT_ATTEMPTS = 3;
/** Agent calls per creative: schema/assignment/repeat fixes plus up to MAX_BRIEF_REVISIONS critic revisions. */
const MAX_PLAN_CALLS = 5;
/** Listing photos shown to the QA reviewers (cost vs. coverage). */
const QA_REFERENCE_PHOTOS = 4;
const IMAGE_SUFFIX = (people: PeopleMode) =>
  " Base the scene on the provided reference photos of the real venue and stay faithful to them: same layout, furniture, materials and light. Do not invent features, rooms, views, text, logos, prices or signage; portable event props are fine. Natural light logic and real materials, photographic, not hyper-polished. " +
  peopleRule(people);

/** Recent hooks (same pipeline, whole account) and what this property already got — fed to the agent and the repeat check. */
async function loadCreativeHistory(businessId: string, propertyId: string, pipeline: "social" | "linkedin"): Promise<CreativeHistory> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: contents } = await supabase.from("property_content").select("id, property_id")
    .eq("business_id", businessId).eq("pipeline_type", pipeline).gte("created_at", since)
    .order("created_at", { ascending: false }).limit(40);
  if (!contents?.length) return { recentHooks: [], propertyAngles: [] };
  const { data: revs } = await supabase.from("content_revisions").select("property_content_id, content_decision")
    .in("property_content_id", contents.map((c) => c.id)).not("content_decision", "is", null)
    .order("created_at", { ascending: false }).limit(80);
  const propertyOf = new Map(contents.map((c) => [c.id, c.property_id]));
  const recentHooks: string[] = [];
  const propertyAngles: string[] = [];
  for (const r of revs ?? []) {
    const d = (r.content_decision as { plan?: { data?: { concept?: string; theme?: string; strategy?: { hook?: { line?: string }; event_type?: string; persona?: string; angle?: string } } } } | null)?.plan?.data;
    if (!d) continue;
    const s = d.strategy;
    if (s?.hook?.line && !recentHooks.includes(s.hook.line)) recentHooks.push(s.hook.line);
    if (propertyOf.get(r.property_content_id) === propertyId) {
      const angle = s ? [s.event_type, s.persona, s.angle].filter(Boolean).join(" — ") : d.concept || d.theme;
      if (angle && !propertyAngles.includes(angle)) propertyAngles.push(angle);
    }
  }
  return { recentHooks: recentHooks.slice(0, 20), propertyAngles: propertyAngles.slice(0, 8) };
}

type SocialParams = Omit<CreativeParams, "pipeline"> & { pipeline: "social" | "linkedin" };

export async function generateCreative(step: Step, p: CreativeParams): Promise<{ contentId: string; revisionId: string }> {
  // Blogs have their own flow (no platforms, schedule or video) — see generate-blog.ts.
  if (p.pipeline === "blog") return generateBlog(step, p);
  return generateSocialOrLinkedIn(step, p as SocialParams);
}

async function generateSocialOrLinkedIn(step: Step, p: SocialParams): Promise<{ contentId: string; revisionId: string }> {
  // ---- 1. load ---------------------------------------------------------------
  const loaded = (await step.run("load", async (): Promise<Loaded> => {
    const [{ data: property }, { data: images }, { data: business }, { data: settings }, cycle] = await Promise.all([
      supabase.from("properties").select("title, space_category, event_types, city, region, country, timezone").eq("id", p.propertyId).single(),
      supabase.from("property_images").select("url, position, validation_status").eq("property_id", p.propertyId).neq("validation_status", "broken").order("position"),
      supabase.from("businesses").select("name, industry, description, tone_of_voice, business_voice, target_audience, target_countries").eq("id", p.businessId).single(),
      supabase.from("content_automation_settings").select("generation_timezone").eq("business_id", p.businessId).maybeSingle(),
      p.cycleId ? supabase.from("content_generation_cycles").select("week_start").eq("id", p.cycleId).single() : Promise.resolve({ data: null }),
    ]);
    if (!property) throw new PermanentGenerationError("property not found");
    const imageUrls = (images ?? []).map((i) => i.url).filter((u) => /^https?:\/\//i.test(u));
    if (!imageUrls.length) throw new PermanentGenerationError("property has no usable reference images");
    const timezone = property.timezone || settings?.generation_timezone || "America/Toronto";
    const weekStart = (cycle.data as { week_start?: string } | null)?.week_start
      ?? addDays(mondayOf(new Date().toISOString().slice(0, 10)), 7);
    return {
      property: {
        title: property.title, spaceCategory: property.space_category, eventTypes: property.event_types ?? [],
        city: property.city, region: property.region, country: property.country, timezone: property.timezone,
      },
      imageUrls, business: (business ?? {}) as BusinessFacts, timezone, weekStart,
    };
  })) as Loaded;

  // ---- 2. plan: the agent decides the creative; the critic reviews it (Gate 1) --
  // One AI call per step (plan-N / review-N), so no step runs long and every call is
  // memoized. Nothing paid (image/video) happens until a plan passes the review.

  // A re-run of a job reuses its saved plan instead of paying for the AI again.
  const resumed = (await step.run("resume", async () => {
    if (p.mode !== "job") return { contentId: p.contentId ?? null, contentType: null, saved: null };
    const { data: existing } = await supabase.from("property_content").select("id, content_type").eq("queue_id", p.queueId!).maybeSingle();
    if (!existing) return { contentId: null, contentType: null, saved: null };
    const { data: rev } = await supabase.from("content_revisions").select("id, content_decision, validation_status")
      .eq("property_content_id", existing.id).order("revision_number", { ascending: false }).limit(1).maybeSingle();
    const saved = rev && rev.validation_status === "pending" && rev.content_decision?.plan
      ? { revisionId: rev.id as string, plan: rev.content_decision.plan as Plan }
      : null;
    return { contentId: existing.id as string, contentType: existing.content_type as string, saved };
  })) as { contentId: string | null; contentType: string | null; saved: { revisionId: string; plan: Plan } | null };

  let decided: { contentId: string; revisionId: string; contentType: "image" | "video" | "text_image"; plan: Plan };
  if (resumed.saved) {
    const plan = resumed.saved.plan;
    decided = { contentId: resumed.contentId!, revisionId: resumed.saved.revisionId, contentType: plan.kind === "linkedin" ? "text_image" : plan.data.content_type, plan };
  } else {
    // An existing job record keeps its content type (property_content.content_type is fixed at creation).
    const forceType = p.forceType ?? (p.pipeline === "social" && (resumed.contentType === "image" || resumed.contentType === "video") ? resumed.contentType : null);

    const ctx = (await step.run("plan-context", async () => ({
      history: await loadCreativeHistory(p.businessId, p.propertyId, p.pipeline),
      // The weekly mix assigns queue slots (not user regenerations) a fixed objective/framework/hook type.
      assignment: p.mode === "job" && p.cycleId && p.slotIndex ? await loadSlotAssignment(p.businessId, p.cycleId, p.pipeline, p.slotIndex) : null,
    }))) as { history: CreativeHistory; assignment: SlotCreative | null };

    let feedback: string | null = null;
    let lastError = "";
    let accepted: Plan | null = null;
    const warnings: string[] = [];
    const reviews: BriefReview[] = [];
    for (let a = 1; a <= MAX_PLAN_CALLS && !accepted; a++) {
      const r = (await step.run(`plan-${a}`, async () => {
        await keepAlive(p);
        return runAgent({ p, loaded, guidance: p.guidance ?? null, forceType, history: ctx.history, assignment: ctx.assignment, feedback });
      })) as { ok: true; plan: Plan } | { ok: false; error: string };
      if (!r.ok) { lastError = r.error; feedback = r.error; continue; }
      const candidate = r.plan;
      const last = a === MAX_PLAN_CALLS;

      // Deterministic checks first (free): the slot's assigned mix and hook repeats.
      const mismatches = ctx.assignment ? assignmentMismatches(candidate.data.strategy, ctx.assignment) : [];
      const repeated = findRepeatedHook(candidate.data.strategy.hook.line, ctx.history.recentHooks);
      if ((mismatches.length || repeated) && !last) {
        feedback = [
          ...mismatches,
          ...(repeated ? [`the chosen hook "${candidate.data.strategy.hook.line}" is too close to the recent hook "${repeated}" — write a clearly different hook`] : []),
        ].join("; ");
        lastError = feedback;
        continue;
      }

      const review = (await step.run(`review-${a}`, async () => {
        await keepAlive(p);
        const { system, user } = getBriefReviewPrompt({
          pipeline: p.pipeline, property: loaded.property, photoCount: Math.min(loaded.imageUrls.length, QA_REFERENCE_PHOTOS), planJson: JSON.stringify(planForReview(candidate), null, 2),
          spaceDetails: candidate.kind === "social" ? candidate.data.space_details : undefined,
          video: isVideo(candidate),
        });
        let raw: string;
        try {
          raw = await aiOrchestrator.describeImages(user, loaded.imageUrls.slice(0, QA_REFERENCE_PHOTOS), { systemPrompt: system, temperature: 0, detail: "high" });
        } catch (e) {
          // A listing photo that can't be fetched must not block the review: judge against the facts alone.
          console.warn("[CONTENT_BRIEF_REVIEW] photos unavailable, reviewing text only:", e instanceof Error ? e.message : e);
          raw = await aiOrchestrator.executeTask("analysis", user + "\n\n(The reference photos could not be loaded for this review: judge faithfulness against the listing facts only, and treat any specific venue feature the facts don't state as unsupported.)", "openai", { systemPrompt: system });
        }
        const parsed = briefReviewSchema.safeParse(parseAgentJson(raw));
        if (!parsed.success) throw new Error("brief review returned an unusable answer: " + parsed.error.issues.map((i) => i.message).join("; "));
        return scoreBrief(parsed.data);
      })) as BriefReview;
      reviews.push(review);

      if (review.passed) {
        if (mismatches.length) warnings.push(`did not follow the weekly mix: ${mismatches.join("; ")}`);
        if (repeated) warnings.push(`hook resembles a recent hook: "${repeated}"`);
        accepted = candidate;
      } else if (reviews.length > MAX_BRIEF_REVISIONS) {
        throw new PermanentGenerationError(`the plan failed the creative review ${reviews.length} times: ${briefFeedback(review)}`);
      } else {
        feedback = briefFeedback(review);
        lastError = `the plan failed the creative review: ${feedback}`;
      }
    }
    if (!accepted) throw new Error(lastError || "the agent did not return a plan that could be reviewed");
    const plan: Plan = accepted;
    const brief = reviews[reviews.length - 1];

    decided = (await step.run("save-decision", async () => {
      let contentId = resumed.contentId;
      let revisionId = p.revisionId ?? null;
      const contentType = plan.kind === "linkedin" ? "text_image" : plan.data.content_type;
      const content_decision = {
        plan, decided_at: new Date().toISOString(),
        ...(ctx.assignment ? { assignment: ctx.assignment } : {}),
        qa: { brief: { ...brief, rounds: reviews.length } },
        ...(warnings.length ? { warnings } : {}),
      };
      const fields = revisionFields(plan);

      if (p.mode === "job") {
        if (!contentId) {
          const { data: pc, error } = await supabase.from("property_content").insert({
            business_id: p.businessId, property_id: p.propertyId, cycle_id: p.cycleId, queue_id: p.queueId,
            pipeline_type: p.pipeline, content_type: contentType, environment: p.environment, generation_status: "processing",
          }).select("id").single();
          if (error || !pc) throw new Error("could not create content record: " + error?.message);
          contentId = pc.id;
        }
        revisionId = await insertRevision(p.businessId, contentId!, { content_decision, ...fields });
        await supabase.from("content_generation_queue").update({ content_type: contentType, generation_state: { step: "decided", contentId, revisionId } }).eq("id", p.queueId!);
      } else {
        const { error } = await supabase.from("content_revisions").update({ content_decision, ...fields }).eq("id", revisionId!);
        if (error) throw new Error("could not update revision: " + error.message);
      }
      return { contentId: contentId!, revisionId: revisionId!, contentType, plan };
    })) as typeof decided;
  }

  const { contentId, revisionId, contentType, plan } = decided;

  // ---- 3. posting times ------------------------------------------------------
  // Preferred: the slot the weekly planner already chose for this job's position, so the
  // week is balanced across all posts. A regeneration keeps the creative's existing
  // slot. Otherwise (e.g. the manual trigger, no plan) the AI proposes for this creative
  // alone and the validator enforces the rules against what other creatives already hold.
  await step.run("schedule", async () => {
    const platforms = plan.kind === "linkedin" ? ["linkedin"] : [...SOCIAL_PLATFORMS];
    let slots: ProposedSlot[] | null = null;

    if (p.mode === "job" && p.cycleId && p.slotIndex) {
      // Tolerant read: a missing column or no plan just means "fall back", never a failure.
      const { data, error } = await supabase.from("content_generation_cycles").select("week_plan").eq("id", p.cycleId).single();
      const weekPlan = !error ? (data?.week_plan as Partial<Record<"social" | "linkedin", PlannedPost[]>> | null) : null;
      const entry = weekPlan?.[p.pipeline]?.find((x) => x.slot_index === p.slotIndex);
      if (entry?.slots?.length && platforms.every((pf) => entry.slots.some((s) => s.platform === pf))) {
        slots = entry.slots.map((s) => ({ ...s, source: "week_plan" as const }));
      }
    } else if (p.mode === "regen") {
      const { data: pc } = await supabase.from("property_content").select("current_revision_id").eq("id", contentId).single();
      if (pc?.current_revision_id) {
        const { data: prev } = await supabase.from("content_revisions").select("proposed_schedule").eq("id", pc.current_revision_id).single();
        if (Array.isArray(prev?.proposed_schedule) && prev.proposed_schedule.length) slots = prev.proposed_schedule as ProposedSlot[];
      }
    }

    if (!slots) {
      const taken: { platform: string; ms: number }[] = [];
      const existingLocal: { platform: string; local: string }[] = [];
      if (p.cycleId) {
        const { data: others } = await supabase.from("property_content").select("id").eq("cycle_id", p.cycleId).neq("id", contentId);
        if (others?.length) {
          const { data: revs } = await supabase.from("content_revisions").select("proposed_schedule")
            .in("property_content_id", others.map((o) => o.id)).not("proposed_schedule", "is", null);
          for (const r of revs ?? []) for (const s of (r.proposed_schedule as ProposedSlot[]) ?? []) {
            taken.push({ platform: s.platform, ms: Date.parse(s.scheduled_at) });
            existingLocal.push({ platform: s.platform, local: s.local });
          }
        }
      }
      let raw: unknown = null;
      try {
        const { system, user } = getSchedulePrompt({
          weekStart: loaded.weekStart, timezone: loaded.timezone, pipeline: p.pipeline, platforms,
          contentType, city: loaded.property.city, existing: existingLocal,
        });
        raw = parseAgentJson(await aiOrchestrator.executeTask("analysis", user, "openai", { systemPrompt: system }));
      } catch (e) {
        console.warn("[CONTENT_SCHEDULE] AI proposal unavailable, using defaults:", e instanceof Error ? e.message : e);
      }
      slots = validateProposedSchedule({ weekStart: loaded.weekStart, timezone: loaded.timezone, platforms, raw, taken })
        .map((s) => ({ ...s, source: "per_creative" as const }));
    }

    const { error } = await supabase.from("content_revisions").update({ proposed_schedule: slots }).eq("id", revisionId);
    if (error) throw new Error("could not save proposed schedule: " + error.message);
  });

  // ---- 4–5. media → media check (Gate 2) → validate --------------------------
  // A failed media check re-renders ONCE, as a new revision: a completed clip is
  // immutable (content_clips_guard), and the rejected revision stays visible in the
  // gallery with its reasons.
  let rev = revisionId;
  let fix: string | null = null;
  // A revision that is itself an automatic re-render has used the retry already — also when the
  // job restarts and resumes it — so it never triggers another paid render.
  const alreadyRetried = (await step.run("media-attempts", async () => {
    const { data } = await supabase.from("content_revisions").select("content_decision").eq("id", revisionId).single();
    return !!(data?.content_decision as { retry_of?: string } | null)?.retry_of;
  })) as boolean;
  const maxAttempts = alreadyRetried ? 1 : MAX_MEDIA_ATTEMPTS;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const pfx = attempt === 1 ? "" : `retry${attempt}-`;
    if (attempt > 1) {
      const prev = rev;
      rev = (await step.run(`${pfx}new-revision`, () => cloneRevisionForRetry(p.businessId, contentId, prev, fix!))) as string;
    }
    try {
      const assetId = await produceMedia(step, { p, loaded, plan, contentId, revisionId: rev, pfx, fix });
      await step.run(`${pfx}attach-media`, async () => {
        const { error } = await supabase.from("content_revisions").update({ media_asset_id: assetId }).eq("id", rev);
        if (error) throw new Error("could not attach media: " + error.message);
      });
      // Product decision: a rendered VIDEO is never checked or rejected afterwards — quality is
      // controlled before generation (prompts + the plan review). Images keep the photo comparison.
      const review = isVideo(plan) ? VIDEO_NOT_REVIEWED : await reviewMedia(step, { p, loaded, plan, contentId, revisionId: rev, pfx, assetId });
      if (review.status === "failed" && attempt < maxAttempts) {
        const rejected = rev;
        await step.run(`${pfx}reject-revision`, async () => {
          const { data: r } = await supabase.from("content_revisions").select("content_decision").eq("id", rejected).single();
          const d = (r?.content_decision ?? {}) as { qa?: object };
          await supabase.from("content_revisions").update({
            validation_status: "invalid",
            validation_errors: review.blockers.map((b) => `media check: ${b}`),
            content_decision: { ...d, qa: { ...(d.qa ?? {}), media: review } },
          }).eq("id", rejected);
        });
        fix = review.fix;
        continue;
      }
      await finalize(step, { p, plan, contentType, contentId, revisionId: rev, pfx, review });
      return { contentId, revisionId: rev };
    } catch (e) {
      // The retry revision is ours: never leave it pending (that would block every later regeneration).
      if (attempt > 1) {
        const failed = rev;
        const message = e instanceof Error ? e.message : String(e);
        await step.run(`${pfx}mark-invalid`, async () => {
          await supabase.from("content_revisions").update({ validation_status: "invalid", validation_errors: [message.slice(0, 500)] })
            .eq("id", failed).eq("validation_status", "pending");
        });
      }
      throw e;
    }
  }
  throw new PermanentGenerationError("media generation ended without a result");
}

// ---- helpers -------------------------------------------------------------------

const isVideo = (plan: Plan) => plan.kind === "social" && plan.data.content_type === "video";
const VIDEO_NOT_REVIEWED: MediaReview = { status: "skipped", blockers: [], warnings: [], fix: null };

interface MediaArgs { p: SocialParams; loaded: Loaded; plan: Plan; contentId: string; revisionId: string; pfx: string; fix: string | null }

/** One agent call: the plan, or the exact reason it was rejected (fed back on the next call). Network/provider errors throw (step retry). */
/** Exported for dry runs (scratch tooling) — the pipeline calls it from its plan-N steps. */
export async function runAgent(a: {
  p: SocialParams; loaded: Loaded; guidance: string | null; forceType: "image" | "video" | null;
  history: CreativeHistory; assignment: SlotCreative | null; feedback: string | null;
}): Promise<{ ok: true; plan: Plan } | { ok: false; error: string }> {
  const common = { business: a.loaded.business, property: a.loaded.property, guidance: a.guidance, history: a.history, feedback: a.feedback, assignment: a.assignment };
  const { system, user } = a.p.pipeline === "linkedin" ? getLinkedInAgentPrompt(common) : getSocialAgentPrompt({ ...common, forceType: a.forceType });
  // The agent SEES the listing photos, so what it shows and narrates comes from the real space.
  let raw: string;
  try {
    raw = await aiOrchestrator.describeImages(user, a.loaded.imageUrls.slice(0, QA_REFERENCE_PHOTOS), { systemPrompt: system, detail: "high" });
  } catch (e) {
    console.warn("[CONTENT_AGENT] photos unavailable, planning from the facts only:", e instanceof Error ? e.message : e);
    raw = await aiOrchestrator.executeTask("analysis", user + "\n\n(The photos could not be loaded: describe the space only in general terms the listing facts support.)", "openai", { systemPrompt: system });
  }
  let json: unknown;
  try { json = parseAgentJson(raw); } catch (e) { return { ok: false, error: `the answer was not valid JSON (${e instanceof Error ? e.message : e})` }; }
  // Name the field, what was expected and what came back, so the agent can actually fix it.
  const issues = (err: { issues: { path: PropertyKey[]; message: string; code?: string; expected?: unknown; input?: unknown }[] }) =>
    err.issues.map((i) => {
      const got = i.input === undefined ? "nothing" : Array.isArray(i.input) ? "a list" : typeof i.input;
      const exp = i.expected ? ` (expected ${String(i.expected)}, got ${got})` : "";
      return `${i.path.map(String).join(".") || "(root)"}: ${i.message}${exp}`;
    }).join("; ") + ". Return every field with exactly the type shown in the JSON shape.";
  if (a.p.pipeline === "linkedin") {
    const parsed = linkedinAgentSchema.safeParse(json);
    return parsed.success ? { ok: true, plan: { kind: "linkedin", data: parsed.data } } : { ok: false, error: "the plan was invalid: " + issues(parsed.error) };
  }
  let parsed = socialAgentSchema.safeParse(json);
  // Every VIDEO's voice-over is written by the narration writer (one focused text call), not the planner,
  // whose lines are only a draft. Skipped when the plan has other problems: it is re-planned anyway.
  if (isVideoJson(json) && (parsed.success || onlyNarrationProblems(parsed.error.issues))) {
    const written = await writeNarration(a, json, null);
    if (written) {
      json = written;
      parsed = socialAgentSchema.safeParse(json);
      if (!parsed.success) console.warn(`[CONTENT_AGENT] written narration invalid: ${issues(parsed.error)}`);
    }
  }
  // A voice-over that fails a check goes back to the writer with what was wrong (far cheaper than
  // re-planning with the photos); it gets a second try if the fix itself slips.
  for (let r = 0; r < MAX_NARRATION_REWRITES && !parsed.success && onlyNarrationProblems(parsed.error.issues); r++) {
    const repaired = await writeNarration(a, json, issues(parsed.error));
    if (!repaired) break;
    json = repaired;
    parsed = socialAgentSchema.safeParse(json);
    if (!parsed.success) console.warn(`[CONTENT_AGENT] narration rewrite ${r + 1} still invalid: ${issues(parsed.error)}`);
  }
  if (!parsed.success) return { ok: false, error: "the plan was invalid: " + issues(parsed.error) };
  if (a.forceType && parsed.data.content_type !== a.forceType) return { ok: false, error: `content_type must be "${a.forceType}"` };
  return { ok: true, plan: { kind: "social", data: parsed.data } };
}

const MAX_NARRATION_REWRITES = 2;
/** The voice-over a (raw or parsed) shot currently carries: its narration, or its draft lines joined in shot order. */
function currentNarration(shot: { beats?: { start_s: number; line?: string }[]; narration?: unknown } | undefined): string {
  if (typeof shot?.narration === "string" && shot.narration.trim()) return shot.narration.trim();
  return [...(shot?.beats ?? [])].sort((x, y) => Number(x.start_s) - Number(y.start_s)).map((b) => b.line ?? "").join(" ").trim();
}

/** A raw (unparsed) plan that is a video with shots — the narration writer's input. */
function isVideoJson(json: unknown): boolean {
  const j = json as { content_type?: unknown; video?: { shot?: { beats?: unknown } } } | null;
  return !!j && j.content_type === "video" && Array.isArray(j.video?.shot?.beats) && (j.video!.shot!.beats as unknown[]).length > 0;
}
const NARRATION_PROBLEM = /narration|line is \d+ words|space_details|EVERY shot|^the hook /i;
const HOOK_PROBLEM = /^the hook /i;
function onlyNarrationProblems(list: { message: string }[]): boolean {
  return list.length > 0 && list.every((i) => NARRATION_PROBLEM.test(i.message));
}

/** The mood from a raw (unparsed) plan's voice, which may be { mood } or just the mood string. */
function voiceMoodOf(v: unknown): VoiceMood | undefined {
  const m = String((v && typeof v === "object" ? (v as { mood?: unknown }).mood : v) ?? "").trim().toLowerCase();
  return (VOICE_MOODS as readonly string[]).includes(m) ? (m as VoiceMood) : undefined;
}

/**
 * One text-only call to the narration writer: writes the voice-over (problems = null) or fixes one that failed
 * a check. Returns the patched plan JSON, or null if the answer was unusable (the plan is then left as it was).
 */
async function writeNarration(a: { loaded: Loaded }, json: unknown, problems: string | null): Promise<unknown | null> {
  type RawBeat = { start_s: number; end_s: number; action?: string; people?: string; line?: string };
  type RawPlan = {
    space_details?: string[]; strategy?: { persona?: string; event_type?: string; hook?: { line?: string; hook_type?: string } };
    caption?: string; platform_captions?: Record<string, string | undefined>;
    video?: { shot?: { beats?: RawBeat[]; narration?: unknown; voice?: unknown } };
  };
  const plan = json as RawPlan;
  // `problems` is "path: message; path: message" — root-level issues use the path "(root)".
  const rewriteHook = !!problems && problems.split("; ").some((m) => HOOK_PROBLEM.test(m.replace(/^\(?[\w.]*\)?: /, "")));
  const beats = plan.video?.shot?.beats;
  if (!Array.isArray(beats) || !beats.length || !Array.isArray(plan.space_details)) return null;
  const ordered = [...beats].sort((x, y) => Number(x.start_s) - Number(y.start_s));
  const { system, user } = getNarrationWriterPrompt({
    property: a.loaded.property, spaceDetails: plan.space_details, hook: plan.strategy?.hook?.line ?? "",
    rewriteHook, hookType: plan.strategy?.hook?.hook_type, persona: plan.strategy?.persona, eventType: plan.strategy?.event_type,
    voiceMood: voiceMoodOf(plan.video?.shot?.voice),
    beats: ordered.map((b) => ({ start_s: Number(b.start_s), end_s: Number(b.end_s), action: String(b.action ?? ""), people: String(b.people ?? "none") })),
    minWords: VIDEO_MIN_NARRATION_WORDS, maxWords: VIDEO_MAX_NARRATION_WORDS, minDetails: MIN_NAMED_DETAILS, problems,
    current: problems ? currentNarration(plan.video?.shot) : null,
  });
  try {
    const out = parseAgentJson(await aiOrchestrator.executeTask("analysis", user, "openai", { systemPrompt: system })) as { voiceover?: unknown; hook?: unknown };
    const voiceover = typeof out.voiceover === "string" ? out.voiceover.replace(/\s+/g, " ").trim() : "";
    if (!voiceover) {
      console.warn("[CONTENT_AGENT] narration writer returned no voiceover");
      return null;
    }
    const oldHook = plan.strategy?.hook?.line ?? "";
    const newHook = rewriteHook && typeof out.hook === "string" ? out.hook.trim() : "";
    // The voice-over is ONE paragraph (Seedance voices it as one take); the planner's per-shot draft lines are
    // dropped so the schema uses it as written. The spoken opener is the writer's own: only the hook's idea carries over.
    const shot = { ...plan.video!.shot!, narration: voiceover, beats: beats.map(({ line: _draft, ...b }) => { void _draft; return b; }) };
    let patched: RawPlan = { ...plan, video: { ...plan.video, shot } };
    if (newHook) {
      // The captions open with the hook: swap it there too so copy and video agree.
      const swap = (t: string | undefined) => (t && oldHook && t.includes(oldHook) ? t.replace(oldHook, newHook) : t);
      patched = {
        ...patched,
        strategy: { ...plan.strategy, hook: { ...plan.strategy?.hook, line: newHook } },
        caption: swap(plan.caption),
        platform_captions: Object.fromEntries(Object.entries(plan.platform_captions ?? {}).map(([k, v]) => [k, swap(v)])),
      };
    }
    return patched;
  } catch (e) {
    console.warn("[CONTENT_AGENT] narration rewrite failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** What the critic sees: the decisions and everything that will be rendered or posted — not the hook brainstorm. */
function planForReview(plan: Plan): Record<string, unknown> {
  const { hook_candidates: _candidates, ...strategy } = plan.data.strategy;
  void _candidates;
  if (plan.kind === "linkedin") {
    const d = plan.data;
    return { format: "LinkedIn text + one square image", strategy, people: d.people, post_text: d.post_text, hashtags: d.hashtags, image_scene: d.image.visual_prompt, image_headline: d.image.hook.headline };
  }
  const d = plan.data;
  return {
    format: d.content_type === "video" ? "one 30-second vertical video, text-free" : "one 4:5 image, text-free",
    strategy, space_details: d.space_details, people: d.people, concept: d.concept, script: d.script, caption: d.caption, platform_captions: d.platform_captions, hashtags: d.hashtags,
    ...(d.image ? { image_scene: d.image.visual_prompt } : {}),
    ...(d.video ? { video_prompt_sent_to_the_model: d.video.clips[0].prompt } : {}),
  };
}

function revisionFields(plan: Plan) {
  return plan.kind === "linkedin"
    ? { script: plan.data.theme, caption: plan.data.post_text, hashtags: plan.data.hashtags, video_format: null, video_duration: null, format_reason: plan.data.reason }
    : {
        script: plan.data.script || plan.data.concept, caption: plan.data.caption, hashtags: plan.data.hashtags,
        video_format: plan.data.video ? VIDEO_FORMAT : null,
        video_duration: plan.data.video ? plan.data.video.clips.reduce((s, c) => s + c.duration_seconds, 0) + END_CARD_SECONDS : null,
        format_reason: plan.data.video?.format_reason || plan.data.reason,
      };
}

async function insertRevision(businessId: string, contentId: string, fields: Record<string, unknown>): Promise<string> {
  const { data: last } = await supabase.from("content_revisions").select("revision_number").eq("property_content_id", contentId).order("revision_number", { ascending: false }).limit(1);
  const { data: rev, error } = await supabase.from("content_revisions").insert({
    business_id: businessId, property_content_id: contentId, revision_number: (last?.[0]?.revision_number ?? 0) + 1, ...fields,
  }).select("id").single();
  if (error || !rev) throw new Error("could not create revision: " + error?.message);
  return rev.id;
}

/** A new pending revision with the same plan, copy and posting slots — only the media is re-rendered, steered by the media check's fix. */
async function cloneRevisionForRetry(businessId: string, contentId: string, fromRevisionId: string, fix: string): Promise<string> {
  const { data: from, error } = await supabase.from("content_revisions")
    .select("content_decision, script, caption, hashtags, video_format, video_duration, format_reason, proposed_schedule").eq("id", fromRevisionId).single();
  if (error || !from) throw new Error("could not read the revision to retry: " + error?.message);
  const d = (from.content_decision ?? {}) as { qa?: { brief?: unknown } };
  return insertRevision(businessId, contentId, {
    script: from.script, caption: from.caption, hashtags: from.hashtags, video_format: from.video_format, video_duration: from.video_duration,
    format_reason: from.format_reason, proposed_schedule: from.proposed_schedule,
    generation_prompt: `Automatic re-render after the media check: ${fix}`.slice(0, 1000),
    content_decision: { ...d, qa: { brief: d.qa?.brief }, retry_of: fromRevisionId, media_fix: fix },
  });
}

/** Weekly-mix assignment for a queue slot; the rotation continues from the creatives made before this cycle. */
async function loadSlotAssignment(businessId: string, cycleId: string, pipeline: "social" | "linkedin", slotIndex: number): Promise<SlotCreative | null> {
  const { data: cycle } = await supabase.from("content_generation_cycles").select("created_at").eq("id", cycleId).single();
  if (!cycle?.created_at) return null;
  const { count } = await supabase.from("property_content").select("id", { count: "exact", head: true })
    .eq("business_id", businessId).eq("pipeline_type", pipeline).lt("created_at", cycle.created_at);
  return assignSlotCreative(pipeline, slotIndex, count ?? 0);
}

/** Runs one ffmpeg job on the renderer, polls it, and stores the result (with its own probe). */
async function runFfmpeg(step: Step, a: { p: SocialParams; contentId: string; revisionId: string; label: string; submit: () => Promise<string>; output: { type: "video" | "image"; mime: string; ext: string; durationSeconds?: number }; meta: Record<string, unknown> }) {
  const jobId = (await step.run(`submit-${a.label}`, async () => { await keepAlive(a.p); return a.submit(); })) as string;
  let outUrl: string | null = null;
  for (let i = 0; i < 24 && !outUrl; i++) {
    await step.sleep(`wait-${a.label}-${i}`, "15s");
    const st = (await step.run(`check-${a.label}-${i}`, async () => {
      await keepAlive(a.p);
      const r = await FFmpegService.checkStatus(jobId);
      if (r.status === "failed" || r.status === "error") throw new Error(`ffmpeg ${a.label} failed: ${r.error || "unknown error"}`);
      return { url: r.status === "finished" ? r.url ?? null : null };
    })) as { url: string | null };
    outUrl = st.url;
  }
  if (!outUrl) throw new Error(`ffmpeg ${a.label} timed out`);
  const sourceUrl = outUrl;
  return (await step.run(`store-${a.label}`, async () => { await keepAlive(a.p); return storeRemoteMedia({
    businessId: a.p.businessId, sourceUrl, path: `${a.p.businessId}/content/${a.contentId}/${a.revisionId}-${a.label}.${a.output.ext}`,
    type: a.output.type, mime: a.output.mime, durationSeconds: a.output.durationSeconds, metadata: { contentId: a.contentId, revisionId: a.revisionId, ...a.meta }, headers: FFmpegService.getHeaders(),
  }); })) as { assetId: string; publicUrl: string };
}

/** Renders the image or the Seedance clip for one revision; returns the final media asset id. */
async function produceMedia(step: Step, a: MediaArgs): Promise<string> {
  const { p, loaded, plan, contentId, revisionId, pfx, fix } = a;
  const fixText = fix ? ` Correct these problems from the previous render: ${fix}` : "";

  if (plan.kind === "linkedin" || plan.data.content_type === "image") {
    // One Kie image render: create the task, poll it, return the (still unstored) result URL.
    const renderImage = async (label: string, prompt: string, ratio: "1:1" | "4:5") => {
      // Native 4:5 (Instagram's feed accepts 0.8–1.91; the legacy 2:3 remap is 0.67) and JPEG (Instagram requires it).
      const taskId = (await step.run(`${pfx}create-${label}-task`, () =>
        aiOrchestrator.createImageTask(prompt, ratio, loaded.imageUrls.slice(0, 5), "reference", { exactRatio: true, outputFormat: "jpg" }))) as string;
      let imageUrl: string | null = null;
      for (let i = 0; i < 30 && !imageUrl; i++) {
        await step.sleep(`${pfx}wait-${label}-${i}`, i === 0 ? "8s" : "6s");
        const status = (await step.run(`${pfx}check-${label}-${i}`, async () => {
          await keepAlive(p);
          const s = await aiOrchestrator.checkTaskStatus(taskId);
          if (s.state === "fail") throw new Error(`Image generation failed: ${s.failMsg || s.failCode || "no reason given"}`);
          return { state: s.state as string, url: s.state === "success" ? kieResultUrl(s) : null };
        })) as { state: string; url: string | null };
        imageUrl = status.url;
      }
      if (!imageUrl) throw new Error("Image generation timed out");
      return imageUrl;
    };

    let prompt: string;
    let url: string;
    let hookMeta: { headline: string; verified: true; attempts: number } | undefined;
    // Stored plans from before hooks existed have no headline: they render as a plain image.
    const headline = plan.kind === "linkedin" ? (plan.data.image as { hook?: { headline?: string } }).hook?.headline : undefined;
    // Plans stored before the people rule existed have no "people": treat them as people-free.
    const people = plan.data.people ?? "none";

    if (plan.kind === "linkedin" && headline) {
      // The image model renders the hook text, but a headline is never accepted on its say-so:
      // a vision model reads back what is on the image letter by letter and it must match the
      // intended text exactly, with no other text. A bad render is regenerated; after the last try
      // the run fails closed rather than keeping a misspelled image.
      prompt = plan.data.image.visual_prompt + fixText + LINKEDIN_TEXT_IMAGE_SUFFIX(headline) + " " + peopleRule(people);
      let verified: string | null = null;
      const problems: string[] = [];
      for (let t = 1; t <= MAX_TEXT_ATTEMPTS && !verified; t++) {
        const candidate = await renderImage(`image-${t}`, prompt, "1:1");
        const verdict = (await step.run(`${pfx}verify-text-${t}`, async () => {
          await keepAlive(p);
          try {
            const raw = await aiOrchestrator.describeImages(TEXT_CHECK_PROMPT, [candidate], { systemPrompt: TEXT_CHECK_SYSTEM, temperature: 0, detail: "high" });
            return verifyRenderedText(headline, parseTextRead(raw));
          } catch (e) {
            return { ok: false, errors: [`could not read the image text: ${e instanceof Error ? e.message : "unknown error"}`] };
          }
        })) as { ok: boolean; errors: string[] };
        if (verdict.ok) { verified = candidate; hookMeta = { headline, verified: true, attempts: t }; }
        else problems.push(`try ${t}: ${verdict.errors.join("; ")}`);
      }
      if (!verified) throw new PermanentGenerationError(`The image headline "${headline}" could not be rendered correctly after ${MAX_TEXT_ATTEMPTS} tries (${problems.join(" | ")})`);
      url = verified;
    } else {
      prompt = (plan.kind === "linkedin" ? plan.data.image.visual_prompt : plan.data.image!.visual_prompt) + fixText + IMAGE_SUFFIX(people);
      url = await renderImage("image", prompt, plan.kind === "linkedin" ? "1:1" : "4:5");
    }

    const stored = (await step.run(`${pfx}store-image`, () => storeRemoteMedia({
      businessId: p.businessId, sourceUrl: url, path: `${p.businessId}/content/${contentId}/${revisionId}-image.jpg`,
      type: "image", mime: "image/jpeg", metadata: { contentId, revisionId, prompt, ...(hookMeta ? { hook: hookMeta } : {}) },
      transform: withLogo,   // the Kangrooo logo, top-right (the headline check above ran on the clean render)
    }))) as { assetId: string };
    return stored.assetId;
  }

  const video = plan.data.video!;
  // Exactly one clip (see video-spec.ts): clip index 1.
  type ClipRow = { id: string; clip_index: number; status: string; provider_task_id: string | null; media_asset_id: string | null; attempts: number; max_attempts: number };
  const clips = (await step.run(`${pfx}ensure-clips`, async () => [await rpc<ClipRow>("ensure_content_clip", { p_revision: revisionId, p_index: 1 })])) as ClipRow[];

  const taskIds: Record<number, string> = {};
  const assetIds: Record<number, string> = {};
  for (const c of clips) {
    if (c.status === "completed" && c.media_asset_id) assetIds[c.clip_index] = c.media_asset_id;
    else if (c.status === "processing" && c.provider_task_id) taskIds[c.clip_index] = c.provider_task_id;
  }

  const created = (await step.run(`${pfx}create-clip-tasks`, async () => {
    const out: Record<number, string> = {};
    // Re-read fresh: if this step is being retried after creating clip 1's
    // task, clip 1 must be reused, not billed a second time.
    const { data: fresh } = await supabase.from("content_clips").select("id, clip_index, status, provider_task_id, media_asset_id, attempts, max_attempts").eq("revision_id", revisionId);
    for (const c0 of clips) {
      const c = (fresh ?? []).find((f) => f.clip_index === c0.clip_index) ?? c0;
      if (c.status === "completed" && c.media_asset_id) continue;
      if (c.status === "processing" && c.provider_task_id) { out[c.clip_index] = c.provider_task_id; continue; }
      if (assetIds[c.clip_index] || taskIds[c.clip_index]) continue;
      if (c.attempts >= c.max_attempts) throw new PermanentGenerationError(`clip ${c.clip_index} failed ${c.attempts} times`);
      const spec = video.clips[c.clip_index - 1];
      const prompt = spec.prompt + VIDEO_SUFFIX + (fix ? `\nCORRECT THESE PROBLEMS FROM THE PREVIOUS RENDER: ${fix}` : "");
      await keepAlive(p);
      const taskId = await aiOrchestrator.createSeedanceVideoTask({
        prompt, referenceImageUrls: loaded.imageUrls.slice(0, 4), aspectRatio: "9:16", duration: spec.duration_seconds, generateAudio: true, resolution: VIDEO_RESOLUTION,
      });
      await supabase.from("content_clips").update({
        provider_task_id: taskId, status: "processing", attempts: c.attempts + 1, started_at: new Date().toISOString(),
        last_error: null, request_params: { prompt, duration: spec.duration_seconds, aspect_ratio: "9:16", model: SEEDANCE_MODEL },
      }).eq("id", c.id);
      out[c.clip_index] = taskId;
    }
    return out;
  })) as Record<number, string>;
  Object.assign(taskIds, created);

  const clipUrls: Record<number, string> = {};
  const pendingIdx = () => clips.map((c) => c.clip_index).filter((i) => !assetIds[i] && !clipUrls[i]);
  for (let i = 0; i < 120 && pendingIdx().length; i++) {   // ~40 min: a 30 s clip renders slowly
    await step.sleep(`${pfx}wait-video-${i}`, i === 0 ? "30s" : "20s");
    const res = (await step.run(`${pfx}check-video-${i}`, async () => {
      await keepAlive(p);
      const found: Record<number, string> = {};
      for (const idx of pendingIdx()) {
        const s = await aiOrchestrator.checkTaskStatus(taskIds[idx]);
        if (s.state === "fail") {
          const clip = clips.find((c) => c.clip_index === idx)!;
          await supabase.from("content_clips").update({ status: "failed", last_error: String(s.failMsg || s.failCode || "no reason given").slice(0, 500) }).eq("id", clip.id);
          throw new Error(`Video clip ${idx} failed: ${s.failMsg || s.failCode || "no reason given"}`);
        }
        if (s.state === "success") {
          const u = kieResultUrl(s);
          if (u) found[idx] = u;
        }
      }
      return found;
    })) as Record<number, string>;
    Object.assign(clipUrls, res);
  }
  if (pendingIdx().length) throw new Error("Video generation timed out");

  for (const c of clips) {
    if (assetIds[c.clip_index]) continue;
    const stored = (await step.run(`${pfx}store-clip-${c.clip_index}`, async () => {
      await keepAlive(p);   // a large upload can be slow: renew the lease before it starts
      const dur = video.clips[c.clip_index - 1].duration_seconds;
      const s = await storeRemoteMedia({
        businessId: p.businessId, sourceUrl: clipUrls[c.clip_index], path: `${p.businessId}/content/${contentId}/${revisionId}-clip${c.clip_index}.mp4`,
        type: "video", mime: "video/mp4", durationSeconds: dur, metadata: { contentId, revisionId, clip: c.clip_index },
      });
      await supabase.from("content_clips").update({ status: "completed", media_asset_id: s.assetId, duration_seconds: dur, last_error: null }).eq("id", c.id);
      return s;
    })) as { assetId: string };
    assetIds[c.clip_index] = stored.assetId;
  }

  // What was actually produced for the clip (read back from the stored probe, so a re-run
  // that skipped storing still has it).
  const input = (await step.run(`${pfx}clip-inputs`, async () => {
    const { data } = await supabase.from("media_assets").select("id, metadata").eq("id", assetIds[1]).single();
    const m = data?.metadata as { publicUrl?: string; probe?: VideoProbe } | undefined;
    return {
      url: m?.publicUrl ?? null, durationSeconds: m?.probe?.durationSeconds ?? video.clips[0].duration_seconds,
      width: m?.probe?.width || VIDEO_WIDTH, height: m?.probe?.height || VIDEO_HEIGHT, fps: m?.probe?.fps || 24, hasAudio: m?.probe?.hasAudio ?? true,
    };
  })) as { url: string | null; durationSeconds: number; width: number; height: number; fps: number; hasAudio: boolean };
  if (!input.url) throw new PermanentGenerationError("clip media is missing a public URL");

  // Branding, in ONE renderer job: the Kangrooo logo top-right, then the clip dips to black and a 1 s end
  // card (white logo fading in on black) is appended. It re-encodes on the renderer and writes the moov
  // atom first (Instagram needs that), so it replaces the old faststart remux.
  const brand = (await step.run(`${pfx}brand-logo`, async () => {
    await keepAlive(p);
    const [logo, card] = await Promise.all([ensureVideoLogo(p.businessId, input.width), ensureEndCard(p.businessId, input.width, input.height)]);
    return { logo, card };
  })) as { logo: { url: string; offset: number }; card: { url: string } };
  const brandArgs = { offset: brand.logo.offset, hasAudio: input.hasAudio, durationSeconds: input.durationSeconds, fps: input.fps };
  const branded = await runFfmpeg(step, {
    p, contentId, revisionId, label: `${pfx}branded`, submit: () => submitBrandVideoJob(input.url!, brand.logo.url, brand.card.url, brandArgs),
    output: { type: "video", mime: "video/mp4", ext: "mp4", durationSeconds: input.durationSeconds + END_CARD_SECONDS },
    meta: { brandedFromClip: 1, logo: { url: brand.logo.url, offset: brand.logo.offset }, endCard: { url: brand.card.url, seconds: END_CARD_SECONDS, version: END_CARD_VERSION } },
  });
  return branded.assetId;
}

/**
 * Gate 2: the produced image (or a 3×2 frame grid of the video) is compared with the
 * listing photos. If the check itself can't run (renderer or vision failure), the
 * creative isn't blocked — it's recorded as "unavailable" with a warning.
 */
async function reviewMedia(step: Step, a: Omit<MediaArgs, "fix"> & { assetId: string }): Promise<MediaReview> {
  const { p, loaded, plan, contentId, revisionId, pfx, assetId } = a;
  const kind: "image" | "video" = plan.kind === "social" && plan.data.content_type === "video" ? "video" : "image";
  try {
    let reviewUrl: string;
    if (kind === "image") {
      reviewUrl = (await step.run(`${pfx}media-check-source`, async () => {
        const { data } = await supabase.from("media_assets").select("metadata").eq("id", assetId).single();
        const url = (data?.metadata as { publicUrl?: string } | null)?.publicUrl;
        if (!url) throw new Error("the generated image has no public URL");
        return url;
      })) as string;
    } else {
      const videoUrl = (await step.run(`${pfx}media-check-source`, async () => {
        const { data } = await supabase.from("media_assets").select("metadata").eq("id", assetId).single();
        const url = (data?.metadata as { publicUrl?: string } | null)?.publicUrl;
        if (!url) throw new Error("the generated video has no public URL");
        return url;
      })) as string;
      const grid = await runFfmpeg(step, {
        p, contentId, revisionId, label: `${pfx}frames`, submit: () => submitFrameGridJob(videoUrl),
        output: { type: "image", mime: "image/jpeg", ext: "jpg" }, meta: { purpose: "media_check_frames" },
      });
      reviewUrl = grid.publicUrl;
    }
    return (await step.run(`${pfx}media-check`, async () => {
      await keepAlive(p);
      const refs = loaded.imageUrls.slice(0, QA_REFERENCE_PHOTOS);
      const { system, user } = getMediaReviewPrompt({
        kind, photoCount: refs.length, people: plan.data.people ?? "none",
        headline: plan.kind === "linkedin" ? plan.data.image.hook?.headline ?? null : null,
        concept: plan.kind === "linkedin" ? plan.data.theme : plan.data.concept,
      });
      const raw = await aiOrchestrator.describeImages(user, [...refs, reviewUrl], { systemPrompt: system, temperature: 0, detail: "high" });
      const parsed = mediaReviewSchema.safeParse(parseAgentJson(raw));
      if (!parsed.success) throw new Error("media review returned an unusable answer: " + parsed.error.issues.map((i) => i.message).join("; "));
      return decideMediaReview(parsed.data);
    })) as MediaReview;
  } catch (e) {
    if (isPermanentError(e)) throw e;   // lease lost / automation paused — stop, don't paper over it
    return mediaReviewUnavailable(e instanceof Error ? e.message : String(e));
  }
}

/** Validate against the REAL media + every platform (+ the media check), then make it current in the gallery — never on a social account. */
async function finalize(step: Step, a: { p: SocialParams; plan: Plan; contentType: "image" | "video" | "text_image"; contentId: string; revisionId: string; pfx: string; review: MediaReview }) {
  const { plan, contentType, contentId, revisionId, pfx, review } = a;
  await step.run(`${pfx}validate-and-finalize`, async () => {
    const [{ data: rev }, { data: clipRows }] = await Promise.all([
      supabase.from("content_revisions").select("caption, hashtags, media_asset_id, video_format, video_duration, content_decision").eq("id", revisionId).single(),
      supabase.from("content_clips").select("status, media_asset_id, duration_seconds").eq("revision_id", revisionId).order("clip_index"),
    ]);
    if (!rev) throw new PermanentGenerationError("revision disappeared");
    const { data: asset } = rev.media_asset_id
      ? await supabase.from("media_assets").select("metadata").eq("id", rev.media_asset_id).single()
      : { data: null };
    const probe = (asset?.metadata as { probe?: MediaProbe } | null)?.probe ?? null;

    const done = (clipRows ?? []).filter((c) => c.status === "completed" && c.media_asset_id);
    const check = validateRevisionContent({
      contentType, caption: rev.caption, hashtags: rev.hashtags ?? [], hasMedia: !!rev.media_asset_id,
      videoFormat: rev.video_format as "single_clip" | null,
      // The planned length (not the measured one) — a video is never rejected for how it rendered.
      clipDurations: done.map(() => VIDEO_TOTAL_SECONDS), completedClips: done.length,
    });
    const errors = [...check.errors];
    const warnings: string[] = [...review.warnings];
    if (review.status === "failed") errors.push(...review.blockers.map((b) => `media check: ${b}`));
    let platformChecks: PlatformChecks | null = null;
    // Problems found in a rendered VIDEO are recorded, never blocking (product decision: no gate after generation).
    const mediaProblems = isVideo(plan) ? warnings : errors;

    // Fail closed for images: media we couldn't inspect is not publishable.
    if (!probe) mediaProblems.push("generated media could not be inspected");
    else if (plan.kind === "social") {
      const m = checkSocialMedia(probe);
      platformChecks = m.checks;
      mediaProblems.push(...m.errors);
    }
    if (probe?.kind === "video") {
      const requested = Number(rev.video_duration ?? 0);
      if (requested && Math.abs(probe.durationSeconds - requested) > 2) warnings.push(`measured ${probe.durationSeconds}s vs ${requested}s requested`);
      // The 30 s clip plus the appended end card.
      const expected = VIDEO_TOTAL_SECONDS + END_CARD_SECONDS;
      if (Math.abs(probe.durationSeconds - expected) > 2) mediaProblems.push(`video should be ${expected} s but is ${probe.durationSeconds} s`);
    }

    const posts = plan.kind === "social"
      ? buildSocialPosts({ caption: rev.caption ?? "", platformCaptions: plan.data.platform_captions, hashtags: rev.hashtags ?? [] })
      : buildLinkedInPost({ text: rev.caption ?? "", hashtags: rev.hashtags ?? [] });
    errors.push(...copyErrors(posts));

    // Record what was measured, the media check and the exact per-platform copy, whether or not it passed — the gallery shows all of it.
    const mediaInfo = probe && {
      kind: probe.kind, width: probe.width, height: probe.height, sizeBytes: probe.sizeBytes,
      ...(probe.kind === "video"
        ? { durationSeconds: probe.durationSeconds, fps: probe.fps, videoCodec: probe.videoCodec, audioCodec: probe.audioCodec, hasAudio: probe.hasAudio, moovBeforeMdat: probe.moovBeforeMdat }
        : { format: probe.format }),
      checks: platformChecks, warnings,
    };
    const prevDecision = (rev.content_decision ?? {}) as { qa?: object };
    const patch: Record<string, unknown> = {
      content_decision: { ...prevDecision, qa: { ...(prevDecision.qa ?? {}), media: review }, media: mediaInfo, platformPosts: posts },
    };
    if (probe?.kind === "video") patch.video_duration = probe.durationSeconds;   // measured, not requested
    await supabase.from("content_revisions").update(patch).eq("id", revisionId);

    if (errors.length) {
      await supabase.from("content_revisions").update({ validation_status: "invalid", validation_errors: errors }).eq("id", revisionId);
      throw new PermanentGenerationError("validation failed: " + errors.join("; "));
    }
    const { error: vErr } = await supabase.from("content_revisions").update({ validation_status: "valid", validation_errors: null }).eq("id", revisionId);
    if (vErr) throw new PermanentGenerationError("revision could not be validated: " + vErr.message);
    const { error: pErr } = await supabase.from("property_content").update({ current_revision_id: revisionId, generation_status: "completed" }).eq("id", contentId);
    if (pErr) throw new PermanentGenerationError("could not publish revision to the gallery: " + pErr.message);
  });
}
