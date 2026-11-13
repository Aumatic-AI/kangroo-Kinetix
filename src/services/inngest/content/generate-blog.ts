import { z } from "zod";
import { aiOrchestrator } from "@/services/ai/orchestrator";
import { parseAgentJson } from "@/services/content-automation/agents";
import {
  blogAgentSchema, blogToMarkdown, countBlogWords, slugify, validateBlogContent,
  type BlogAgentOutput, type BlogBlock,
} from "@/services/content-automation/blog";
import type { MediaProbe } from "@/services/content-automation/media-probe";
import { getBlogAgentPrompt, getBlogObservationPrompt, type BusinessFacts, type PropertyFacts } from "@/prompts/content-automation";
import { supabase, storeRemoteMedia, withLogo, kieResultUrl, keepAlive, PermanentGenerationError, type Step } from "./shared";
import { prepareReferenceImages } from "./references";
import { classifyKieFailure, imageReferenceUrls } from "@/services/content-automation/reference-images";
import type { CreativeParams } from "./generate-creative";

/**
 * Blog pipeline. For one listing the AI (1) looks at the listing photos,
 * (2) decides the post's format / angle / structure / length / images from what
 * the listing actually offers and writes it, (3) generates the images from the
 * listing photos, (4) validates, and files it in the gallery.
 *
 * Display-only, like every other content type during testing: it writes only the
 * gallery tables (property_content / content_revisions / media_assets), never a
 * social_posts row, never a schedule, never a publishing call.
 *
 * Storage layout (no blog-specific columns): script = title, caption = full
 * Markdown, hashtags = tags, media_asset_id = hero image, content_decision.blog
 * = the structured post.
 */

const IMAGE_SUFFIX = " Landscape 16:9 editorial photograph. Base the scene on the provided reference photos of the real venue and stay faithful to them. Do not invent features, text, logos, prices or signage. Never reproduce cartoon, film or game characters, mascots, branded decorations, artworks or images on screens from the photos: show them as plain, unbranded versions.";
const MAX_WRITE_ATTEMPTS = 3;

const observationSchema = z.object({
  observations: z.array(z.string()).default([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, 12)),
  style: z.string().default(""),
  suited_to: z.array(z.string()).default([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, 5)),
});
type Observations = z.infer<typeof observationSchema>;

/** What is stored under content_decision.blog on the revision. */
interface StoredImage { id: string; role: "hero" | "inline"; alt: string; caption: string; prompt: string; taskId: string | null; assetId: string | null; url: string | null }
interface StoredBlog {
  title: string; slug: string; meta_description: string; format: string; format_reason: string; angle: string; reason: string;
  tags: string[]; blocks: BlogBlock[]; images: StoredImage[]; wordCount: number; observations: Observations | null;
}

interface Loaded {
  property: PropertyFacts;
  imageUrls: string[];
  business: BusinessFacts;
  previousAngles: string[];
  legacyHints: string[];
}

/** Read-modify-write of the revision's content_decision (steps run sequentially, so no race). */
async function patchDecision(revisionId: string, mutate: (cd: Record<string, unknown>) => Record<string, unknown>) {
  const { data, error } = await supabase.from("content_revisions").select("content_decision").eq("id", revisionId).single();
  if (error || !data) throw new Error("could not read revision: " + error?.message);
  const next = mutate((data.content_decision ?? {}) as Record<string, unknown>);
  const { error: upErr } = await supabase.from("content_revisions").update({ content_decision: next }).eq("id", revisionId);
  if (upErr) throw new Error("could not update revision: " + upErr.message);
}

const storedBlogOf = (cd: Record<string, unknown> | null | undefined) => (cd?.blog ?? null) as StoredBlog | null;

export async function generateBlog(step: Step, p: CreativeParams): Promise<{ contentId: string; revisionId: string }> {
  // ---- 1. load the listing + what has already been written about it ------------
  const loaded = (await step.run("load", async (): Promise<Loaded> => {
    const [{ data: property }, { data: business }] = await Promise.all([
      supabase.from("properties").select("title, space_category, event_types, city, region, country, legacy_fields").eq("id", p.propertyId).single(),
      supabase.from("businesses").select("name, industry, description, tone_of_voice, business_voice, target_audience, target_countries").eq("id", p.businessId).single(),
    ]);
    if (!property) throw new PermanentGenerationError("property not found");
    // Listing photos as real JPEGs in our bucket (free, cached) — Kie refuses the imported `.avif` files.
    const refs = await prepareReferenceImages(p.businessId, p.propertyId);
    const imageUrls = imageReferenceUrls(refs);

    // Angles already used for this listing (every valid blog revision, including earlier versions
    // of the one being regenerated), so each run picks a different format/angle.
    const previousAngles: string[] = [];
    const { data: prior } = await supabase.from("property_content").select("id").eq("property_id", p.propertyId).eq("pipeline_type", "blog");
    if (prior?.length) {
      const { data: revs } = await supabase.from("content_revisions").select("script, content_decision")
        .in("property_content_id", prior.map((x) => x.id)).eq("validation_status", "valid");
      for (const r of revs ?? []) {
        const b = storedBlogOf(r.content_decision as Record<string, unknown> | null);
        previousAngles.push(`${b?.format ?? "post"}: ${b?.angle ?? r.script ?? ""}`.slice(0, 220));
      }
    }

    // Imported spreadsheet history: topic hints only (never copied).
    const legacyHints: string[] = [];
    const legacyType = (property.legacy_fields as Record<string, unknown> | null)?.blog_type;
    if (typeof legacyType === "string" && legacyType.trim()) legacyHints.push(`Earlier blog type recorded for this listing: ${legacyType.trim()}`);
    const { data: legacy } = await supabase.from("property_legacy_content").select("caption").eq("property_id", p.propertyId).eq("kind", "blog").limit(5);
    for (const l of legacy ?? []) if (l.caption?.trim()) legacyHints.push(l.caption.trim().slice(0, 200));

    return {
      property: { title: property.title, spaceCategory: property.space_category, eventTypes: property.event_types ?? [], city: property.city, region: property.region, country: property.country },
      imageUrls, business: (business ?? {}) as BusinessFacts, previousAngles: [...new Set(previousAngles)], legacyHints,
    };
  })) as Loaded;

  // ---- 2. the AI looks at the listing photos (grounding; failure is not fatal) --
  const observed = (await step.run("observe", async (): Promise<Observations | null> => {
    try {
      const { system, user } = getBlogObservationPrompt({ property: loaded.property, imageCount: Math.min(5, loaded.imageUrls.length) });
      const raw = await aiOrchestrator.describeImages(user, loaded.imageUrls.slice(0, 5), { systemPrompt: system });
      const parsed = observationSchema.safeParse(parseAgentJson(raw));
      return parsed.success ? parsed.data : null;
    } catch (e) {
      console.warn("[CONTENT_BLOG] photo observation unavailable, writing from listing facts only:", e instanceof Error ? e.message : e);
      return null;
    }
  })) as Observations | null;

  // ---- 3. the AI decides the format/angle/structure and writes the post --------
  const decided = (await step.run("write", async () => {
    let contentId = p.contentId ?? null;
    let revisionId = p.revisionId ?? null;

    // Reuse an earlier run's post for this job so a re-run doesn't pay for the AI again.
    if (p.mode === "job") {
      const { data: existing } = await supabase.from("property_content").select("id, generation_status").eq("queue_id", p.queueId!).maybeSingle();
      if (existing) {
        contentId = existing.id;
        const { data: rev } = await supabase.from("content_revisions").select("id, content_decision, validation_status")
          .eq("property_content_id", existing.id).order("revision_number", { ascending: false }).limit(1).single();
        const stored = storedBlogOf(rev?.content_decision as Record<string, unknown> | null);
        if (rev && rev.validation_status === "pending" && stored) return { contentId, revisionId: rev.id as string, plan: stored };
      }
    }

    // Write, then check the text; if the model's output is malformed or fails a deterministic
    // check, tell it exactly what was wrong and let it correct itself before giving up.
    let plan: BlogAgentOutput | null = null;
    let slug = "";
    let feedback = "";
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS && !plan; attempt++) {
      const { system, user } = getBlogAgentPrompt({
        business: loaded.business, property: loaded.property, observations: observed,
        previousAngles: loaded.previousAngles, legacyHints: loaded.legacyHints,
        guidance: [p.guidance, feedback && `Your previous answer was rejected: ${feedback}. ${/too short/.test(feedback) ? "Write a much LONGER post: at least 700 words, with 8 or more full paragraphs of 60–120 words each. Expand every section with practical planning advice. " : ""}Return a corrected, complete JSON object.`].filter(Boolean).join("\n") || null,
      });
      const raw = await aiOrchestrator.executeTask("analysis", user, "openai", { systemPrompt: system });
      let candidate: BlogAgentOutput;
      try {
        const parsed = blogAgentSchema.safeParse(parseAgentJson(raw));
        if (!parsed.success) { feedback = parsed.error.issues.map((i) => i.message).join("; "); continue; }
        candidate = parsed.data;
      } catch (e) {
        feedback = e instanceof Error ? e.message : "the response was not valid JSON";
        continue;
      }
      const candidateSlug = slugify(candidate.slug || candidate.title);
      const check = validateBlogContent({ title: candidate.title, slug: candidateSlug, metaDescription: candidate.meta_description, blocks: candidate.blocks });
      if (!check.ok) { feedback = check.errors.join("; "); continue; }
      plan = candidate;
      slug = candidateSlug;
    }
    if (!plan) throw new Error(`Blog agent did not produce a valid post after ${MAX_WRITE_ATTEMPTS} attempts: ${feedback}`);

    const blog: StoredBlog = {
      title: plan.title, slug, meta_description: plan.meta_description, format: plan.format, format_reason: plan.format_reason,
      angle: plan.angle, reason: plan.reason, tags: plan.tags, blocks: plan.blocks, wordCount: countBlogWords(plan.blocks),
      images: [...plan.images].sort((a, b) => (a.role === "hero" ? -1 : b.role === "hero" ? 1 : 0)).map((i) => ({
        id: i.id, role: i.role, alt: i.alt, caption: i.caption, prompt: i.visual_prompt, taskId: null, assetId: null, url: null,
      })),
      observations: observed,
    };
    const fields = {
      script: plan.title,
      caption: blogToMarkdown({ title: plan.title, metaDescription: plan.meta_description, blocks: plan.blocks, hero: null, images: {}, tags: plan.tags }),
      hashtags: plan.tags, video_format: null, video_duration: null, format_reason: plan.format_reason || plan.reason,
    };
    const content_decision = { plan: { kind: "blog", data: { format: plan.format, angle: plan.angle, reason: plan.reason } }, blog, decided_at: new Date().toISOString() };

    if (p.mode === "job") {
      if (!contentId) {
        const { data: pc, error } = await supabase.from("property_content").insert({
          business_id: p.businessId, property_id: p.propertyId, cycle_id: p.cycleId, queue_id: p.queueId,
          pipeline_type: "blog", content_type: "blog", environment: p.environment, generation_status: "processing",
        }).select("id").single();
        if (error || !pc) throw new Error("could not create content record: " + error?.message);
        contentId = pc.id;
      }
      const { data: last } = await supabase.from("content_revisions").select("revision_number").eq("property_content_id", contentId).order("revision_number", { ascending: false }).limit(1);
      const { data: rev, error: revErr } = await supabase.from("content_revisions").insert({
        business_id: p.businessId, property_content_id: contentId, revision_number: (last?.[0]?.revision_number ?? 0) + 1, content_decision, ...fields,
      }).select("id").single();
      if (revErr || !rev) throw new Error("could not create revision: " + revErr?.message);
      revisionId = rev.id;
      await supabase.from("content_generation_queue").update({ content_type: "blog", generation_state: { step: "written", contentId, revisionId } }).eq("id", p.queueId!);
    } else {
      const { error } = await supabase.from("content_revisions").update({ content_decision, ...fields }).eq("id", revisionId!);
      if (error) throw new Error("could not update revision: " + error.message);
    }
    return { contentId: contentId!, revisionId: revisionId!, plan: blog };
  })) as { contentId: string; revisionId: string; plan: StoredBlog };

  const { contentId, revisionId } = decided;

  // ---- 4. images, generated from the listing photos ---------------------------
  // Progress (task ids, stored assets) is saved on the revision as it happens, so a
  // retry after a partial failure reuses what already exists and is never billed twice.
  const saved = (await step.run("images-state", async () => {
    const { data } = await supabase.from("content_revisions").select("content_decision").eq("id", revisionId).single();
    return (storedBlogOf(data?.content_decision as Record<string, unknown> | null)?.images ?? decided.plan.images) as StoredImage[];
  })) as StoredImage[];
  const todo = saved.filter((i) => !(i.assetId && i.url));

  if (todo.length) {
    const taskIds = (await step.run("create-image-tasks", async () => {
      const out: Record<string, string> = {};
      for (const img of todo) {
        if (img.taskId) { out[img.id] = img.taskId; continue; }
        await keepAlive(p);
        const taskId = await aiOrchestrator.createImageTask(img.prompt + IMAGE_SUFFIX, "16:9", loaded.imageUrls.slice(0, 5), "reference", { exactRatio: true, outputFormat: "jpg" })
          .catch((e: unknown) => {
            const message = e instanceof Error ? e.message : String(e);
            throw classifyKieFailure(message) === "unsupported_file" ? new PermanentGenerationError(`${message} — Kie can't read one of the listing photos`) : e;
          });
        out[img.id] = taskId;
        await patchDecision(revisionId, (cd) => {
          const b = storedBlogOf(cd)!;
          return { ...cd, blog: { ...b, images: b.images.map((x) => (x.id === img.id ? { ...x, taskId } : x)) } };
        });
      }
      return out;
    })) as Record<string, string>;

    const urls: Record<string, string> = {};
    const pending = () => todo.filter((i) => !urls[i.id]);
    for (let i = 0; i < 45 && pending().length; i++) {
      await step.sleep(`wait-blog-images-${i}`, i === 0 ? "10s" : "8s");
      const found = (await step.run(`check-blog-images-${i}`, async () => {
        await keepAlive(p);
        const res: Record<string, string> = {};
        for (const img of pending()) {
          const s = await aiOrchestrator.checkTaskStatus(taskIds[img.id]);
          if (s.state === "fail") throw new Error(`Blog image "${img.id}" failed: ${s.failMsg || s.failCode || "no reason given"}`);
          if (s.state === "success") { const u = kieResultUrl(s); if (u) res[img.id] = u; }
        }
        return res;
      })) as Record<string, string>;
      Object.assign(urls, found);
    }
    if (pending().length) throw new Error("Blog image generation timed out");

    for (const [idx, img] of todo.entries()) {
      await step.run(`store-blog-image-${idx}`, async () => {
        const stored = await storeRemoteMedia({
          businessId: p.businessId, sourceUrl: urls[img.id], path: `${p.businessId}/content/${contentId}/${revisionId}-blog-${idx + 1}.jpg`,
          type: "image", mime: "image/jpeg", metadata: { contentId, revisionId, blogImage: img.id, role: img.role, prompt: img.prompt },
          transform: withLogo,   // the Kangrooo logo, top-right
        });
        await patchDecision(revisionId, (cd) => {
          const b = storedBlogOf(cd)!;
          return { ...cd, blog: { ...b, images: b.images.map((x) => (x.id === img.id ? { ...x, assetId: stored.assetId, url: stored.publicUrl } : x)) } };
        });
        return { assetId: stored.assetId };
      });
    }
  }

  // ---- 5. validate the finished post, then file it in the gallery -------------
  await step.run("validate-and-finalize", async () => {
    const { data: rev } = await supabase.from("content_revisions").select("content_decision").eq("id", revisionId).single();
    const cd = (rev?.content_decision ?? {}) as Record<string, unknown>;
    const blog = storedBlogOf(cd);
    if (!blog) throw new PermanentGenerationError("revision lost its blog content");

    const errors: string[] = [];
    const check = validateBlogContent({ title: blog.title, slug: blog.slug, metaDescription: blog.meta_description, blocks: blog.blocks });
    errors.push(...check.errors);
    for (const img of blog.images) if (!img.assetId || !img.url) errors.push(`image "${img.id}" was not generated`);

    const hero = blog.images.find((i) => i.role === "hero");
    if (!hero?.assetId) errors.push("hero image is missing");
    const { data: asset } = hero?.assetId
      ? await supabase.from("media_assets").select("metadata").eq("id", hero.assetId).single()
      : { data: null };
    const probe = (asset?.metadata as { probe?: MediaProbe } | null)?.probe ?? null;
    if (hero?.assetId && !probe) errors.push("hero image could not be inspected");

    const rendered = Object.fromEntries(blog.images.filter((i) => i.url).map((i) => [i.id, { url: i.url as string, alt: i.alt, caption: i.caption }]));
    const markdown = blogToMarkdown({
      title: blog.title, metaDescription: blog.meta_description, blocks: blog.blocks,
      hero: hero?.url ? rendered[hero.id] : null, images: rendered, tags: blog.tags,
    });

    const mediaInfo = probe && { kind: probe.kind, width: probe.width, height: probe.height, sizeBytes: probe.sizeBytes, ...(probe.kind === "image" ? { format: probe.format } : {}), checks: null, warnings: [] as string[] };
    const { error: upErr } = await supabase.from("content_revisions").update({
      caption: markdown, media_asset_id: hero?.assetId ?? null,
      content_decision: { ...cd, blog: { ...blog, wordCount: check.wordCount }, media: mediaInfo, platformPosts: null },
    }).eq("id", revisionId);
    if (upErr) throw new Error("could not save the finished post: " + upErr.message);

    if (errors.length) {
      await supabase.from("content_revisions").update({ validation_status: "invalid", validation_errors: errors }).eq("id", revisionId);
      throw new PermanentGenerationError("validation failed: " + errors.join("; "));
    }
    const { error: vErr } = await supabase.from("content_revisions").update({ validation_status: "valid", validation_errors: null }).eq("id", revisionId);
    if (vErr) throw new PermanentGenerationError("revision could not be validated: " + vErr.message);
    const { error: pErr } = await supabase.from("property_content").update({ current_revision_id: revisionId, generation_status: "completed" }).eq("id", contentId);
    if (pErr) throw new PermanentGenerationError("could not publish revision to the gallery: " + pErr.message);
  });

  return { contentId, revisionId };
}
