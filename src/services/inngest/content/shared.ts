import { createClient } from "@supabase/supabase-js";
import { NonRetriableError, type GetStepTools } from "inngest";
import { env } from "@/config";
import type { inngest } from "../client";
import { probeMedia, type MediaProbe } from "@/services/content-automation/media-probe";
import { brandImage, videoLogo, renderEndCard, LOGO_VERSION } from "@/services/content-automation/brand-logo";
import { END_CARD_VERSION } from "@/services/content-automation/video-spec";

/** Service-role client (bypasses RLS), per the Inngest-job convention in CLAUDE.md. */
export const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY!);

export type Step = GetStepTools<typeof inngest>;

const PERMANENT = "[permanent] ";

/**
 * Failures that retrying cannot fix (no images, failed validation, paused
 * automation). Non-retriable for Inngest's own step retries. Inngest
 * re-throws a failed step as a plain StepError (class lost), so permanence is
 * carried in the message prefix — use isPermanentError()/cleanErrorMessage().
 */
export class PermanentGenerationError extends NonRetriableError {
  constructor(message: string) { super(PERMANENT + message); }
}
export const isPermanentError = (e: unknown) => e instanceof Error && e.message.includes(PERMANENT);
export const cleanErrorMessage = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).replace(PERMANENT, "").slice(0, 500);

export const SOCIAL_PLATFORMS = ["instagram", "facebook", "tiktok"] as const;

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/** Downloads a remote file and stores it in business_media; returns the media_assets row id. */
export async function storeRemoteMedia(opts: {
  businessId: string;
  sourceUrl: string;
  path: string;                     // inside business_media
  type: "image" | "video";
  mime: string;
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
  headers?: Record<string, string>;
  /** Changes the downloaded bytes before they are probed and stored (e.g. brandImage stamps the logo); its metadata is saved on the asset. */
  transform?: (bytes: Buffer) => Promise<{ buffer: Buffer; metadata?: Record<string, unknown> }>;
}): Promise<{ assetId: string; publicUrl: string; probe: MediaProbe }> {
  const res = await fetch(opts.sourceUrl, opts.headers ? { headers: opts.headers } : undefined);
  if (!res.ok) throw new Error(`Failed to download generated ${opts.type}: ${res.status}`);
  let buffer: Buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength < 1000) throw new Error(`Downloaded ${opts.type} is empty or corrupted (${buffer.byteLength} bytes)`);
  let transformMeta: Record<string, unknown> = {};
  if (opts.transform) {
    try { ({ buffer, metadata: transformMeta = {} } = await opts.transform(buffer)); }
    catch (e) { throw new Error(`Generated ${opts.type} could not be processed: ${e instanceof Error ? e.message : e}`); }
  }

  // Inspect the REAL bytes (duration, size, audio, codec, moov) — validation uses this, not what we requested.
  let probe: MediaProbe;
  try { probe = probeMedia(buffer, opts.type); }
  catch (e) { throw new Error(`Generated ${opts.type} is not usable: ${e instanceof Error ? e.message : e}`); }

  const { error: upErr } = await supabase.storage.from("business_media").upload(opts.path, buffer, { contentType: opts.mime, upsert: true });
  if (upErr) throw new Error(`${opts.type} upload failed: ${upErr.message}`);
  const { data: pub } = supabase.storage.from("business_media").getPublicUrl(opts.path);

  const { data: asset, error } = await supabase
    .from("media_assets")
    .insert({
      business_id: opts.businessId,
      type: opts.type,
      source: "ai_generated",
      bucket: "business_media",
      storage_path: opts.path,
      mime_type: opts.mime,
      size_bytes: buffer.byteLength,
      ...(opts.durationSeconds ? { duration_seconds: opts.durationSeconds } : {}),
      metadata: { publicUrl: pub.publicUrl, origin: "content_automation", probe, ...transformMeta, ...opts.metadata },
    })
    .select("id")
    .single();
  if (error || !asset) throw new Error("Failed to save media asset: " + error?.message);
  return { assetId: asset.id, publicUrl: pub.publicUrl, probe };
}

/** storeRemoteMedia transform that stamps the Kangrooo logo top-right on a generated image. */
export async function withLogo(bytes: Buffer) {
  const { buffer, logo } = await brandImage(bytes);
  return { buffer, metadata: { logo } };
}

/**
 * The white video logo for this width, uploaded once to business_media (the renderer needs a URL).
 * The path carries the logo version and width, so it never serves a stale design.
 */
export async function ensureVideoLogo(businessId: string, videoWidth: number): Promise<{ url: string; offset: number }> {
  const logo = await videoLogo(videoWidth);
  const path = `${businessId}/brand/kangrooo-logo-${LOGO_VERSION}-video-${logo.width}w.png`;
  const { error } = await supabase.storage.from("business_media").upload(path, logo.png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`logo upload failed: ${error.message}`);
  return { url: supabase.storage.from("business_media").getPublicUrl(path).data.publicUrl, offset: logo.offset };
}

/** The end-card PNG (white logo on black) at the video's size, uploaded once to business_media like the corner logo. */
export async function ensureEndCard(businessId: string, width: number, height: number): Promise<{ url: string }> {
  const path = `${businessId}/brand/kangrooo-endcard-${END_CARD_VERSION}-${LOGO_VERSION}-${width}x${height}.png`;
  const { error } = await supabase.storage.from("business_media").upload(path, await renderEndCard(width, height), { contentType: "image/png", upsert: true });
  if (error) throw new Error(`end card upload failed: ${error.message}`);
  return { url: supabase.storage.from("business_media").getPublicUrl(path).data.publicUrl };
}

export function kieResultUrl(status: { resultJson?: string }): string | null {
  try {
    const r = JSON.parse(status.resultJson || "{}");
    return r.resultUrls?.[0] || r.urls?.[0] || null;
  } catch {
    return null;
  }
}

/** Lease renewal + "still allowed to run?" check; only meaningful for queue jobs. */
export async function keepAlive(p: { mode: "job" | "regen"; queueId?: string; worker?: string }) {
  if (p.mode !== "job") return;
  let renewed = await rpc<boolean>("renew_generation_lease", { p_queue: p.queueId, p_worker: p.worker });
  if (!renewed) {
    // renew_generation_lease only extends a lease that hasn't expired yet. A slow step (e.g. a
    // video upload retried for 15+ min) can outlive the lease even though nobody else took the
    // job. Re-acquire it — but ONLY while it is still ours: claim_generation_jobs hands an expired
    // job to a new worker by changing locked_by, so this conditional update then matches nothing.
    const { data } = await supabase.from("content_generation_queue")
      .update({ locked_until: new Date(Date.now() + 15 * 60_000).toISOString() })
      .eq("id", p.queueId!).eq("generation_status", "processing").eq("locked_by", p.worker!)
      .select("id");
    renewed = (data?.length ?? 0) === 1;
  }
  if (!renewed) throw new PermanentGenerationError("lease lost — another worker owns this job");
  const valid = await rpc<boolean>("generation_job_still_valid", { p_queue: p.queueId, p_worker: p.worker });
  if (!valid) throw new PermanentGenerationError("automation was paused or the mode changed — job stopped");
}
