/**
 * Low-level HTTP client for the Upload-Post API. Every other file in this
 * folder builds on these four functions — nothing else in the app should
 * `fetch("https://api.upload-post.com/...")` directly.
 */

import { env } from "@/config/env";

const BASE_URL = "https://api.upload-post.com/api";

function apiKey(): string {
  // Same api.upload-post.com account/key already used for FFmpeg stitching
  // (services/ffmpeg/client.ts) — one Upload-Post account covers both.
  if (!env.FFMPEG_API_KEY) throw new Error("FFMPEG_API_KEY is not configured (used as the Upload-Post API key)");
  return env.FFMPEG_API_KEY;
}

function authHeader(): Record<string, string> {
  return { Authorization: `Apikey ${apiKey()}` };
}

/** An Upload-Post response that was received but was an error. Carries the
 * HTTP status so a caller can tell a definite rejection (4xx — the request was
 * refused, nothing was published) from a server fault (5xx — outcome unknown).
 * A plain `fetch` rejection (network drop / timeout) is NOT this class: the
 * request may or may not have landed. */
export class UploadPostHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "UploadPostHttpError";
  }
}

async function parseOrThrow(res: Response, label: string) {
  const data = await res.json().catch(() => ({}));
  // 202 (scheduled) is a success case even though it's not res.ok's 2xx-only view in some runtimes.
  if (!res.ok && res.status !== 202) {
    throw new UploadPostHttpError(data?.message || data?.error || `Upload-Post ${label} failed (${res.status})`, res.status);
  }
  if (data?.success === false) {
    throw new UploadPostHttpError(data?.message || data?.error || `Upload-Post ${label} failed`, res.status);
  }
  return data;
}

export async function uploadPostGet(path: string, params?: Record<string, string | undefined>) {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), { headers: authHeader() });
  return parseOrThrow(res, `GET ${path}`);
}

export async function uploadPostPostForm(path: string, form: FormData) {
  const res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers: authHeader(), body: form });
  return parseOrThrow(res, `POST ${path}`);
}

export async function uploadPostPostJson(path: string, body: Record<string, any>) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseOrThrow(res, `POST ${path}`);
}

export async function uploadPostPatch(path: string, body: Record<string, any>) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PATCH",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseOrThrow(res, `PATCH ${path}`);
}

export async function uploadPostDelete(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, { method: "DELETE", headers: authHeader() });
  return parseOrThrow(res, `DELETE ${path}`);
}
