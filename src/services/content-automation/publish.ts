/**
 * Content-automation publishing worker (Live posts only).
 *
 * Scheduling lives in the database, NOT on Upload-Post: a post sits in
 * `social_posts` (status `scheduled`) until `claim_publish_jobs` hands it out
 * at its due time, and only then do we call Upload-Post — immediately, with no
 * `scheduledDate`. So pausing automation or switching to Testing can always
 * stop a post, because Upload-Post never holds one.
 *
 * Safety properties (all enforced by SQL; this file only drives them):
 *  - one atomic claim + 'started' attempt log per post (no double publish),
 *  - `publish_block_reason` re-checked right before the external call,
 *  - Upload-Post ids persisted the moment the HTTP response arrives,
 *  - an UNKNOWN outcome is never retried — it is reconciled by id or resolved
 *    by a human (`resolve_unknown_publish`).
 *
 * Only `import type` is used so the control flow is unit-testable without the
 * app's runtime (see scripts/tests/content-automation-publish.test.mjs).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";
import type { UploadPostPlatform, UploadPostPublishResponse, UploadPostStatusResponse } from "@/services/upload-post";

type SocialPostRow = Database["public"]["Tables"]["social_posts"]["Row"];

interface PublishParams {
  user: string;
  platforms: UploadPostPlatform[];
  title: string;
  description?: string;
  facebookPageId?: string;
  linkedinPageId?: string;
}

/** The slice of UploadPostService this worker uses. Note: no scheduledDate. */
export interface UploadPostPort {
  getProfile(username: string): Promise<{ social_accounts: Partial<Record<UploadPostPlatform, unknown>> }>;
  publishVideo(p: PublishParams & { videoUrl: string }): Promise<UploadPostPublishResponse>;
  publishPhotos(p: PublishParams & { photoUrls: string[] }): Promise<UploadPostPublishResponse>;
  publishText(p: PublishParams): Promise<UploadPostPublishResponse>;
  getUploadStatus(p: { requestId?: string; jobId?: string }): Promise<UploadPostStatusResponse>;
}

export interface PublishDeps {
  /** A SERVICE-ROLE client (server only). The claim/finish RPCs are service-role only. */
  db: SupabaseClient<Database>;
  uploadPost: UploadPostPort;
  /** Upload-Post profile username (env.UPLOAD_POST_PROFILE). */
  profile: string;
  worker: string;
  sleep?: (ms: number) => Promise<void>;
  /** Status polls after an accepted-but-not-yet-final response. Default 3. */
  pollAttempts?: number;
  pollIntervalMs?: number;
}

export type PublishOutcome = "published" | "failed" | "retry_scheduled" | "unknown" | "blocked" | "pending" | "error";

export interface PublishResult {
  postId: string;
  outcome: PublishOutcome;
  /** social_posts.status after this call, when known. */
  status?: string;
  detail?: string;
}

interface Payload {
  platform: UploadPostPlatform;
  format: string;
  caption: string | null;
  hashtags: string[];
  media_type: "image" | "video" | null;
  media_url: string | null;
  connection_metadata: { facebookPageId?: string; linkedinPageId?: string } | null;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Decides whether a thrown error means "definitely not published" or "we
 * cannot know". Only a received 4xx (or a 2xx whose body says failure) is a
 * definite rejection; a network drop, timeout or 5xx may have been processed.
 */
export function classifyPublishError(err: unknown): { kind: "rejected"; retryable: boolean; message: string } | { kind: "unknown"; message: string } {
  const message = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number") {
    if (status === 429) return { kind: "rejected", retryable: true, message };
    if (status >= 400 && status < 500 && status !== 408) return { kind: "rejected", retryable: false, message };
    if (status >= 200 && status < 300) return { kind: "rejected", retryable: false, message };
  }
  return { kind: "unknown", message };
}

function isConnected(value: unknown): boolean {
  return !!value && typeof value === "object";
}

export async function publishClaimedPost(deps: PublishDeps, post: SocialPostRow): Promise<PublishResult> {
  const { db } = deps;
  const attempt = post.publish_attempt_count;
  const platform = post.platform as UploadPostPlatform;

  const finish = async (
    outcome: "published" | "failed" | "unknown" | "blocked",
    o: { error?: string; retryable?: boolean; platformPostId?: string; response?: Json; blockReason?: string } = {},
  ): Promise<string> => {
    const { data, error } = await db.rpc("finish_publish", {
      p_post: post.id,
      p_attempt: attempt,
      p_outcome: outcome,
      p_error: o.error,
      p_retryable: o.retryable ?? false,
      p_platform_post_id: o.platformPostId,
      p_response: o.response,
      p_block_reason: o.blockReason,
    });
    if (error) throw new Error(`finish_publish(${outcome}) failed: ${error.message}`);
    return data as string;
  };

  const recheck = async (): Promise<string | null> => {
    const { data, error } = await db.rpc("publish_block_reason", {
      p_post_id: post.id,
      p_expect_status: "publishing",
      p_check_due: false,
    });
    if (error) throw new Error(`publish_block_reason failed: ${error.message}`);
    return (data as string | null) ?? null;
  };

  // 1. Cheap early recheck: mode, enabled, property, revision, validation, connection row, lateness.
  const early = await recheck();
  if (early) {
    const status = await finish("blocked", { blockReason: early, error: early });
    return { postId: post.id, outcome: "blocked", status, detail: early };
  }

  // 2. Payload for the pinned revision.
  const { data: payloadRaw, error: payloadErr } = await db.rpc("get_publish_payload", { p_post: post.id });
  if (payloadErr || !payloadRaw) {
    const status = await finish("failed", { error: `no publish payload: ${payloadErr?.message ?? "empty"}`, retryable: false });
    return { postId: post.id, outcome: "failed", status, detail: "no payload" };
  }
  const payload = payloadRaw as unknown as Payload;
  const hasMedia = payload.media_url && payload.media_type;
  if (payload.format !== "text_image" && payload.format !== "text" && !hasMedia) {
    const status = await finish("failed", { error: "revision has no media to publish", retryable: false });
    return { postId: post.id, outcome: "failed", status, detail: "no media" };
  }
  if (payload.platform === "linkedin" && payload.media_type === "video") {
    // Belt and braces: the DB already forbids this.
    const status = await finish("failed", { error: "LinkedIn never receives video", retryable: false });
    return { postId: post.id, outcome: "failed", status, detail: "linkedin video" };
  }

  // 3. Live connection health on Upload-Post's side (the DB row only says what we last synced).
  try {
    const profile = await deps.uploadPost.getProfile(deps.profile);
    if (!isConnected(profile.social_accounts?.[platform])) {
      const status = await finish("blocked", { blockReason: "connection_unhealthy", error: `${platform} is not connected on Upload-Post` });
      return { postId: post.id, outcome: "blocked", status, detail: "connection_unhealthy" };
    }
  } catch (e) {
    // Nothing was sent yet, so this is a safe, known failure.
    const status = await finish("failed", { error: `connection check failed: ${e instanceof Error ? e.message : String(e)}`, retryable: true });
    return { postId: post.id, outcome: status === "scheduled" ? "retry_scheduled" : "failed", status, detail: "connection check failed" };
  }

  // 4. Recheck IMMEDIATELY before the external call — time has passed since the claim.
  const late = await recheck();
  if (late) {
    const status = await finish("blocked", { blockReason: late, error: late });
    return { postId: post.id, outcome: "blocked", status, detail: late };
  }

  const tags = (payload.hashtags ?? []).map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  const title = [payload.caption ?? "", tags].filter(Boolean).join("\n\n");
  const meta = payload.connection_metadata ?? {};
  const params: PublishParams = {
    user: deps.profile,
    platforms: [platform],
    title,
    facebookPageId: meta.facebookPageId,
    linkedinPageId: meta.linkedinPageId,
  };

  // 5. THE external call. From here on, a thrown error may mean "it landed".
  let response: UploadPostPublishResponse;
  try {
    response =
      payload.media_type === "video"
        ? await deps.uploadPost.publishVideo({ ...params, videoUrl: payload.media_url as string })
        : payload.media_type === "image"
          ? await deps.uploadPost.publishPhotos({ ...params, photoUrls: [payload.media_url as string] })
          : await deps.uploadPost.publishText(params);
  } catch (e) {
    const c = classifyPublishError(e);
    if (c.kind === "rejected") {
      const status = await finish("failed", { error: c.message, retryable: c.retryable });
      return { postId: post.id, outcome: status === "scheduled" ? "retry_scheduled" : "failed", status, detail: c.message };
    }
    // Unknown: never retried automatically.
    const status = await finish("unknown", { error: c.message });
    return { postId: post.id, outcome: "unknown", status, detail: c.message };
  }

  // 6. Persist Upload-Post's ids FIRST, before interpreting anything.
  const responseJson = response as unknown as Json;
  await db.rpc("record_publish_response", {
    p_post: post.id,
    p_attempt: attempt,
    p_request_id: response.request_id,
    p_job_id: response.job_id,
    p_response: responseJson,
  });

  const entry = response.results?.[platform];
  if (entry) {
    if (entry.success) {
      const platformPostId = typeof entry.post_id === "string" ? entry.post_id : entry.url;
      const status = await finish("published", { platformPostId, response: responseJson });
      return { postId: post.id, outcome: "published", status };
    }
    const status = await finish("failed", { error: entry.error || "Upload-Post reported a failure", retryable: false, response: responseJson });
    return { postId: post.id, outcome: "failed", status, detail: entry.error };
  }

  // 7. Accepted for background processing: poll the id we were given.
  const tracking = response.request_id ? { requestId: response.request_id } : response.job_id ? { jobId: response.job_id } : null;
  if (!tracking) {
    const status = await finish("unknown", { error: "Unexpected Upload-Post response (no result and no tracking id)", response: responseJson });
    return { postId: post.id, outcome: "unknown", status, detail: "no tracking id" };
  }
  const sleep = deps.sleep ?? defaultSleep;
  for (let i = 0; i < (deps.pollAttempts ?? 3); i++) {
    await sleep(deps.pollIntervalMs ?? 5_000);
    try {
      const s = await deps.uploadPost.getUploadStatus(tracking);
      if (s.status === "completed") {
        if (s.results?.[0]?.success === false) {
          const status = await finish("failed", { error: s.results[0].message || "Publish failed", retryable: false, response: s as unknown as Json });
          return { postId: post.id, outcome: "failed", status, detail: s.results[0].message };
        }
        const status = await finish("published", { response: s as unknown as Json });
        return { postId: post.id, outcome: "published", status };
      }
      if (s.status === "failed") {
        const status = await finish("failed", { error: s.results?.[0]?.message || "Publish failed", retryable: false, response: s as unknown as Json });
        return { postId: post.id, outcome: "failed", status };
      }
    } catch {
      // Status endpoint trouble is not a publish failure; keep waiting.
    }
  }
  // Still processing. Leave it `publishing`: when its lease expires,
  // recover_stale_publishing flags it unknown and reconcileUnknownPosts
  // resolves it by the id we already saved.
  return { postId: post.id, outcome: "pending", status: "publishing", detail: "still processing at Upload-Post" };
}

/** Resolves unknown-outcome posts that have an Upload-Post id. Never retries. */
export async function reconcileUnknownPosts(deps: PublishDeps): Promise<{ resolved: number; stillUnknown: number }> {
  const { data, error } = await deps.db.rpc("unknown_publish_posts");
  if (error) throw new Error(`unknown_publish_posts failed: ${error.message}`);
  let resolved = 0;
  let stillUnknown = 0;
  for (const post of (data ?? []) as SocialPostRow[]) {
    const id = post.upload_post_request_id ? { requestId: post.upload_post_request_id } : { jobId: post.upload_post_job_id as string };
    try {
      const s = await deps.uploadPost.getUploadStatus(id);
      const failedResult = s.results?.some((r) => r.success === false);
      if (s.status === "completed" && !failedResult) {
        await deps.db.rpc("resolve_unknown_publish", { p_post: post.id, p_outcome: "published", p_note: "reconciled via Upload-Post status" });
        resolved++;
      } else if (s.status === "failed" || (s.status === "completed" && failedResult)) {
        await deps.db.rpc("resolve_unknown_publish", { p_post: post.id, p_outcome: "failed", p_note: s.results?.[0]?.message || "Upload-Post reports the publish failed" });
        resolved++;
      } else {
        stillUnknown++; // pending / processing / not_found: do not guess
      }
    } catch {
      stillUnknown++;
    }
  }
  return { resolved, stillUnknown };
}

/** One worker tick: recover dead leases, claim due posts, publish each. */
export async function runPublishBatch(deps: PublishDeps, opts: { limit?: number } = {}): Promise<PublishResult[]> {
  await deps.db.rpc("recover_stale_publishing");
  const { data, error } = await deps.db.rpc("claim_publish_jobs", { p_worker: deps.worker, p_limit: opts.limit ?? 10 });
  if (error) throw new Error(`claim_publish_jobs failed: ${error.message}`);
  const results: PublishResult[] = [];
  for (const post of (data ?? []) as SocialPostRow[]) {
    try {
      results.push(await publishClaimedPost(deps, post));
    } catch (e) {
      // Anything escaping here may have happened after the external call.
      // Do NOT touch the post: its lease expires, recover_stale_publishing
      // marks it unknown, and it is reconciled, not retried.
      results.push({ postId: post.id, outcome: "error", detail: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
