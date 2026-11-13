import { createHash } from "node:crypto";
import { aiOrchestrator } from "@/services/ai/orchestrator";
import { parseAgentJson } from "@/services/content-automation/agents";
import {
  classifyKieFailure, closestAspect, photosToClean, referenceRisk, referenceScreenSchema, riskLabels, toReferenceJpeg,
  type CleanedReference, type PreparedReference, type ReferenceScreen,
} from "@/services/content-automation/reference-images";
import { getReferenceScreenPrompt, REFERENCE_CLEAN_PROMPT } from "@/prompts/content-automation";
import { supabase, storeRemoteMedia, kieResultUrl, keepAlive, PermanentGenerationError, type Step } from "./shared";

/**
 * Listing photos → reference images Kie accepts. See reference-images.ts for the two problems
 * this solves. Cost policy (product decision, 2026-11-13): nothing is prepared in bulk.
 * - Normalizing (re-encode to JPEG, store in our bucket) is free and happens in the job that
 *   first needs a listing's photos; the result is cached on property_images.media_asset_id.
 * - Screening (OpenAI vision) and cleaning (Kie, ~8 credits a photo) happen ONLY inside a job whose
 *   video Kie has just rejected for copyright, only for that listing, and are cached on the photo's
 *   media asset, so the listing's later jobs start from the cleaned copies.
 */

type RefMeta = {
  publicUrl?: string;
  reference?: { sourceUrl?: string; sourceFormat?: string; screen?: ReferenceScreen & { screenedAt?: string }; clean?: CleanedReference & { taskId?: string; cleanedAt?: string } };
};

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 10);
/** Per-photo download limit while normalizing; a photo that takes longer is skipped for this job. */
const PHOTO_DOWNLOAD_TIMEOUT_MS = 30_000;

/** Read-modify-write of a reference asset's metadata.reference (one job per property at a time). */
async function patchReferenceMeta(assetId: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from("media_assets").select("metadata").eq("id", assetId).single();
  if (error || !data) throw new Error("could not read reference asset: " + error?.message);
  const m = (data.metadata ?? {}) as RefMeta;
  const next = { ...m, reference: { ...(m.reference ?? {}), ...patch } };
  const { error: upErr } = await supabase.from("media_assets").update({ metadata: next as never }).eq("id", assetId);
  if (upErr) throw new Error("could not update reference asset: " + upErr.message);
}

/**
 * The listing's usable photos as normalized JPEGs in our bucket (position order). Free: a download,
 * a sharp re-encode and an upload, once per photo — later jobs reuse the stored copy. A photo that
 * can't be downloaded or decoded is skipped for this job (404/410 marks it broken); with none left
 * the job fails permanently.
 */
export async function prepareReferenceImages(businessId: string, propertyId: string): Promise<PreparedReference[]> {
  const { data: images, error } = await supabase.from("property_images")
    .select("id, url, position, media_asset_id").eq("property_id", propertyId).neq("validation_status", "broken").order("position");
  if (error) throw new Error("could not load listing photos: " + error.message);
  const rows = (images ?? []).filter((i) => /^https?:\/\//i.test(i.url));
  const assetIds = rows.map((r) => r.media_asset_id).filter((x): x is string => !!x);
  const { data: assets } = assetIds.length
    ? await supabase.from("media_assets").select("id, metadata, width_px, height_px").in("id", assetIds)
    : { data: [] as { id: string; metadata: unknown; width_px: number | null; height_px: number | null }[] };
  const assetById = new Map((assets ?? []).map((a) => [a.id, a]));

  const out: PreparedReference[] = [];
  for (const img of rows) {
    const cached = img.media_asset_id ? assetById.get(img.media_asset_id) : undefined;
    const meta = (cached?.metadata ?? {}) as RefMeta;
    const ref = meta.reference;
    if (cached && meta.publicUrl && ref && ref.sourceUrl === img.url) {
      out.push({
        imageId: img.id, position: img.position, sourceUrl: img.url, url: meta.publicUrl, assetId: cached.id,
        width: cached.width_px ?? 0, height: cached.height_px ?? 0,
        screen: ref.screen ? referenceScreenSchema.parse(ref.screen) : null,
        clean: ref.clean?.url ? { url: ref.clean.url, assetId: ref.clean.assetId, verified: !!ref.clean.verified, remaining: ref.clean.remaining ?? [] } : null,
      });
      continue;
    }
    try {
      // Bounded: one stalled photo download must not hold the whole job (seen on the live inventory).
      const res = await fetch(img.url, { signal: AbortSignal.timeout(PHOTO_DOWNLOAD_TIMEOUT_MS) });
      if (!res.ok) {
        if (res.status === 404 || res.status === 410) await supabase.from("property_images").update({ validation_status: "broken" }).eq("id", img.id);
        console.warn(`[REFERENCES] photo ${img.position} of ${propertyId} unavailable (${res.status}) — skipped`);
        continue;
      }
      const jpeg = await toReferenceJpeg(Buffer.from(await res.arrayBuffer()));
      const path = `${businessId}/properties/${propertyId}/ref-${img.position}-${hash(img.url)}.jpg`;
      const { error: upErr } = await supabase.storage.from("business_media").upload(path, jpeg.buffer, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw new Error(`upload failed: ${upErr.message}`);
      const publicUrl = supabase.storage.from("business_media").getPublicUrl(path).data.publicUrl;
      const { data: asset, error: insErr } = await supabase.from("media_assets").insert({
        business_id: businessId, type: "image", source: "uploaded", bucket: "business_media", storage_path: path,
        mime_type: "image/jpeg", size_bytes: jpeg.buffer.byteLength, width_px: jpeg.width, height_px: jpeg.height,
        metadata: { publicUrl, origin: "listing_reference", reference: { propertyImageId: img.id, sourceUrl: img.url, sourceFormat: jpeg.sourceFormat } },
      }).select("id").single();
      if (insErr || !asset) throw new Error("could not save reference asset: " + insErr?.message);
      await supabase.from("property_images").update({ media_asset_id: asset.id, validation_status: "ok" }).eq("id", img.id);
      out.push({ imageId: img.id, position: img.position, sourceUrl: img.url, url: publicUrl, assetId: asset.id, width: jpeg.width, height: jpeg.height, screen: null, clean: null });
    } catch (e) {
      // Not a decodable image (or a storage hiccup): skip this photo for this job; a later job retries it.
      console.warn(`[REFERENCES] photo ${img.position} of ${propertyId} could not be normalized — skipped:`, e instanceof Error ? e.message : e);
    }
  }
  if (!out.length) throw new PermanentGenerationError("property has no usable reference images");
  return out;
}

/** One vision call: what in this photo could trip the copyright audit (cached by the caller). */
async function screenPhoto(url: string): Promise<ReferenceScreen> {
  const raw = await aiOrchestrator.describeImages(getReferenceScreenPrompt(), [url], { temperature: 0, detail: "high" });
  return referenceScreenSchema.parse(parseAgentJson(raw));
}

/**
 * After a copyright rejection: screen this listing's photos (each once, ever) and clean the risky
 * ones with the image model, verifying each cleaned copy with a second screen. Returns the refs
 * with screens and cleaned copies filled in. A photo whose cleaning fails is left uncleaned
 * (chooseVideoReferences then drops it) rather than failing the job.
 */
export async function screenAndCleanReferences(step: Step, a: { p: { businessId: string; propertyId: string; mode: "job" | "regen"; queueId?: string; worker?: string }; refs: PreparedReference[]; pfx: string }): Promise<PreparedReference[]> {
  const refs = a.refs.map((r) => ({ ...r }));
  for (const r of refs) {
    if (r.screen) continue;
    r.screen = (await step.run(`${a.pfx}screen-ref-${r.position}`, async () => {
      await keepAlive(a.p);
      const screen = await screenPhoto(r.url);
      await patchReferenceMeta(r.assetId, { screen: { ...screen, screenedAt: new Date().toISOString() } });
      return screen;
    })) as ReferenceScreen;
  }

  for (const r of photosToClean(refs)) {
    const label = `${a.pfx}clean-ref-${r.position}`;
    const taskId = (await step.run(`${label}-task`, async () => {
      await keepAlive(a.p);
      return aiOrchestrator.createImageTask(REFERENCE_CLEAN_PROMPT, closestAspect(r.width, r.height), [r.url], "reference", { exactRatio: true, outputFormat: "jpg" });
    })) as string;
    let resultUrl: string | null = null;
    let failed: string | null = null;
    for (let i = 0; i < 30 && !resultUrl && !failed; i++) {
      await step.sleep(`${label}-wait-${i}`, i === 0 ? "10s" : "8s");
      const s = (await step.run(`${label}-check-${i}`, async () => {
        const st = await aiOrchestrator.checkTaskStatus(taskId);
        return st.state === "success" ? { url: kieResultUrl(st), failed: null } : st.state === "fail" ? { url: null, failed: String(st.failMsg || st.failCode || "no reason given") } : { url: null, failed: null };
      })) as { url: string | null; failed: string | null };
      resultUrl = s.url;
      failed = s.failed;
    }
    if (!resultUrl) {
      console.warn(`[REFERENCES] cleaning photo ${r.position} of ${a.p.propertyId} failed: ${failed ?? "timed out"} (${classifyKieFailure(failed)})`);
      continue;
    }
    const sourceUrl = resultUrl;
    r.clean = (await step.run(`${label}-store`, async () => {
      await keepAlive(a.p);
      const stored = await storeRemoteMedia({
        businessId: a.p.businessId, sourceUrl, path: `${a.p.businessId}/properties/${a.p.propertyId}/ref-${r.position}-clean-${hash(r.sourceUrl)}.jpg`,
        type: "image", mime: "image/jpeg", metadata: { origin: "listing_reference_clean", reference: { cleanedFrom: r.assetId, kieTaskId: taskId } },
      });
      // The cleaned copy must itself screen low-risk before a render may use it.
      const after = await screenPhoto(stored.publicUrl);
      const clean: CleanedReference = { url: stored.publicUrl, assetId: stored.assetId, verified: referenceRisk(after) === "low", remaining: riskLabels(after) };
      await patchReferenceMeta(r.assetId, { clean: { ...clean, taskId, cleanedAt: new Date().toISOString() } });
      return clean;
    })) as CleanedReference;
  }
  return refs;
}
