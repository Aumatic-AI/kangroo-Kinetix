/**
 * WordPress REST API client (blog.kangrooo.ca) — the only place the app talks to
 * WordPress. Auth is an application password (Users → Profile → Application
 * Passwords) sent as HTTP Basic; the wp-admin password is never used.
 *
 * Every failure is a WordPressError carrying the HTTP status (null = no response),
 * so the caller can classify it with classifyWordPressFailure().
 */
import { env } from "@/config/env";
import type { WordPressPostSummary } from "@/services/content-automation/blog-wordpress";

export class WordPressError extends Error {
  readonly status: number | null;   // plain field: Node's type stripping can't run parameter properties
  constructor(message: string, status: number | null) {
    super(message);
    this.status = status;
    this.name = "WordPressError";
  }
}

const TIMEOUT_MS = 60_000;

function config() {
  const { WORDPRESS_URL: url, WORDPRESS_USERNAME: user, WORDPRESS_APP_PASSWORD: pass } = env;
  // 401 so it's classified as a definite failure (a config problem, not a transient one).
  if (!url || !user || !pass) throw new WordPressError("WordPress is not configured (WORDPRESS_URL / WORDPRESS_USERNAME / WORDPRESS_APP_PASSWORD)", 401);
  return { base: `${url.replace(/\/+$/, "")}/wp-json/wp/v2`, auth: "Basic " + Buffer.from(`${user}:${pass.replace(/\s+/g, "")}`).toString("base64") };
}

async function wp<T>(path: string, init: RequestInit & { query?: Record<string, string> } = {}): Promise<T> {
  const { base, auth } = config();
  const url = new URL(base + path);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { Authorization: auth, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new WordPressError(`WordPress ${init.method ?? "GET"} ${path}: no response (${e instanceof Error ? e.message : e})`, null);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && typeof data === "object" && "message" in data && String(data.message)) || res.statusText;
    const err = new WordPressError(`WordPress ${init.method ?? "GET"} ${path} failed (${res.status}): ${msg}`, res.status);
    (err as WordPressError & { data?: unknown }).data = data;
    throw err;
  }
  return data as T;
}

const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Who the credentials sign in as, and whether they can publish. */
export async function getCurrentUser() {
  return wp<{ id: number; name: string; roles?: string[]; capabilities?: Record<string, boolean> }>("/users/me", { query: { context: "edit" } });
}

/** Downloads an image and uploads it to the media library. Returns the attachment id and its URL. */
export async function uploadImageFromUrl(opts: { sourceUrl: string; filename: string; alt: string; caption: string }) {
  let bytes: ArrayBuffer;
  let mime: string;
  try {
    const res = await fetch(opts.sourceUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bytes = await res.arrayBuffer();
    mime = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  } catch (e) {
    throw new WordPressError(`could not download blog image ${opts.sourceUrl}: ${e instanceof Error ? e.message : e}`, null);
  }
  const media = await wp<{ id: number; source_url: string }>("/media", {
    method: "POST",
    headers: { "Content-Type": mime, "Content-Disposition": `attachment; filename="${opts.filename.replace(/[^a-zA-Z0-9._-]/g, "-")}"` },
    body: bytes,
  });
  // Alt text and caption are a second call; losing them must not cause a duplicate upload.
  try {
    await wp(`/media/${media.id}`, json({ alt_text: opts.alt, caption: opts.caption }));
  } catch (e) {
    console.warn("[WORDPRESS] could not set alt/caption on media", media.id, e instanceof Error ? e.message : e);
  }
  return { id: media.id, url: media.source_url };
}

/** Posts in any state whose title matches the search (used to find a post a lost response already created). */
export async function searchPosts(title: string): Promise<WordPressPostSummary[]> {
  return wp<WordPressPostSummary[]>("/posts", {
    query: { search: title, context: "edit", status: "publish,future,draft,pending,private", per_page: "20", _fields: "id,link,title,date_gmt" },
  });
}

/** Tag ids for these names, creating missing tags. Best effort: a tag that can't be resolved is left out. */
export async function resolveTagIds(names: string[]): Promise<number[]> {
  const ids: number[] = [];
  for (const name of names) {
    try {
      const found = await wp<{ id: number; name: string; slug: string }[]>("/tags", { query: { search: name, per_page: "20", _fields: "id,name,slug" } });
      const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const match = found.find((t) => t.slug === slug || t.name.toLowerCase() === name.toLowerCase());
      if (match) { ids.push(match.id); continue; }
      const created = await wp<{ id: number }>("/tags", json({ name }));
      ids.push(created.id);
    } catch (e) {
      const termId = (e as { data?: { code?: string; data?: { term_id?: number } } }).data;
      if (termId?.code === "term_exists" && termId.data?.term_id) ids.push(termId.data.term_id);
      else console.warn("[WORDPRESS] tag skipped:", name, e instanceof Error ? e.message : e);
    }
  }
  return [...new Set(ids)];
}

/** Creates and publishes a post. */
export async function createPost(post: {
  title: string; content: string; excerpt: string; slug: string;
  featuredMediaId: number | null; tagIds: number[]; categoryId: number | null;
}) {
  return wp<{ id: number; link: string; status: string }>("/posts", json({
    title: post.title,
    content: post.content,
    excerpt: post.excerpt,
    slug: post.slug,
    status: "publish",
    ...(post.featuredMediaId ? { featured_media: post.featuredMediaId } : {}),
    ...(post.tagIds.length ? { tags: post.tagIds } : {}),
    ...(post.categoryId ? { categories: [post.categoryId] } : {}),
  }));
}

export const WordPressService = { getCurrentUser, uploadImageFromUrl, searchPosts, resolveTagIds, createPost };
