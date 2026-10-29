import { env } from "@/config";

/**
 * Shared Meta Graph API client. Every Campaigns/Reports/Leads call goes
 * through this file so there is exactly one place that knows the API
 * version, one place that turns Meta's cryptic error codes into messages a
 * person can act on, and one place that paginates. Promoted out of
 * insights.service.ts (which now imports graphGet/graphGetAllPages from
 * here instead of keeping its own private copies) and out of the legacy
 * project's per-route fetchMetaJson/g/allPages helpers, which were each
 * reimplemented slightly differently across a dozen route files.
 */

export const META_API_VERSION = "v21.0";
export const GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;

/** Meta's error_subcode -> a message that says what to actually do, ported
 * from the legacy launch route's FRIENDLY map (the codes we've actually hit
 * running this ad account). Falls back to Meta's own error_user_title/msg,
 * then its generic message. */
const FRIENDLY_SUBCODES: Record<number, string> = {
  4834002: "Budget conflict: you can't use Campaign Budget Optimization (CBO) and ad-set budget sharing at the same time. Disable one of them.",
  1487390: "Your ad account has reached its spend limit. Go to Meta Ads Manager → Billing and raise or remove the account spend limit.",
  1885252: "The video is still processing on Meta's servers. Wait a minute and try again.",
  1487297: "Your Meta ad account has been disabled. Check Meta Ads Manager → Account Quality for details.",
  2446164: "This ad creative was rejected by Meta's policy review. Edit the ad text or image and try again.",
  1487851: "Invalid targeting: the selected location or audience is too small. Broaden the targeting and try again.",
  100: "Invalid parameter sent to Meta. Check the objective, budget, and targeting fields and try again.",
};

export function metaErrorMessage(errorBody: any): string {
  const error = errorBody?.error;
  if (!error) return "Unknown Meta API error";
  const friendly = error.error_subcode && FRIENDLY_SUBCODES[error.error_subcode];
  if (friendly) return friendly;
  if (error.error_user_title) return `${error.error_user_title}: ${error.error_user_msg || ""}`.trim();
  return error.message || "Unknown Meta API error";
}

class MetaGraphError extends Error {
  constructor(message: string, public code?: number, public subcode?: number) {
    super(message);
    this.name = "MetaGraphError";
  }
}

async function parseResponse(res: Response, path: string) {
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new MetaGraphError(`Meta returned a non-JSON response for ${path} (HTTP ${res.status})`);
  }
  if (!res.ok) {
    throw new MetaGraphError(metaErrorMessage(data), data.error?.code, data.error?.error_subcode);
  }
  return data;
}

export async function graphGet<T = any>(path: string, accessToken: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${GRAPH_URL}/${path}`);
  url.searchParams.set("access_token", accessToken);
  // Forces error/response text to English regardless of the token owner's
  // own Facebook account language (Meta localizes these per-account by
  // default, which is where the Turkish error messages were coming from).
  url.searchParams.set("locale", "en_US");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return parseResponse(res, path);
}

/** Follows Meta's cursor-based pagination, capped at 500 items as a safety limit. */
export async function graphGetAllPages<T = Record<string, any>>(path: string, accessToken: string, params: Record<string, string> = {}): Promise<T[]> {
  const items: T[] = [];
  const first = await graphGet<{ data?: T[]; paging?: { next?: string } }>(path, accessToken, params);
  items.push(...(first.data || []));
  let next: string | null = first.paging?.next || null;
  while (next && items.length < 500) {
    const res = await fetch(next);
    const data = await parseResponse(res, path);
    items.push(...(data.data || []));
    next = data.paging?.next || null;
  }
  return items;
}

export async function graphPost<T = any>(path: string, accessToken: string, body: Record<string, unknown> = {}): Promise<T> {
  // locale lives on the query string, not the JSON body, so it can't ever
  // collide with a route's own "locale" field (e.g. a lead form's display
  // language in the lead-forms create route) — see graphGet above.
  const res = await fetch(`${GRAPH_URL}/${path}?locale=en_US`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, access_token: accessToken }),
  });
  return parseResponse(res, path);
}

/** Media (image/video) uploads use multipart form fields, not JSON. */
export async function graphPostForm<T = any>(path: string, accessToken: string, form: FormData): Promise<T> {
  form.set("access_token", accessToken);
  const res = await fetch(`${GRAPH_URL}/${path}?locale=en_US`, { method: "POST", body: form });
  return parseResponse(res, path);
}

export async function graphDelete<T = any>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${GRAPH_URL}/${path}?access_token=${accessToken}&locale=en_US`, { method: "DELETE" });
  return parseResponse(res, path);
}

export interface MetaAdAccountEnv {
  accessToken: string;
  adAccountId: string;
}

/** Throws with a clear setup message instead of a confusing downstream 400
 * — every Campaigns/Reports route needs this pair, so check it once. */
export function requireMetaAdAccountEnv(): MetaAdAccountEnv {
  const accessToken = env.META_ACCESS_TOKEN;
  const adAccountId = env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId) {
    throw new Error("Meta ad account isn't configured — set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID.");
  }
  return { accessToken, adAccountId };
}

export interface MetaPageEnv {
  pageId: string;
  pageToken: string;
}

/** Leads needs a separate Page-scoped token (leads_retrieval), distinct from
 * the ad-account System User token above — see the Leads tab's setup guide. */
export function requireMetaPageEnv(): MetaPageEnv {
  const pageId = env.META_PAGE_ID;
  const pageToken = env.META_PAGE_TOKEN;
  if (!pageId || !pageToken) {
    throw new Error("Lead Ads isn't configured yet — set META_PAGE_ID and META_PAGE_TOKEN (see the Leads tab's setup guide).");
  }
  return { pageId, pageToken };
}

export interface MetaConversionsEnv {
  accessToken: string;
  datasetId: string;
}

/** Conversions API for CRM — reports a lead's status back to Meta, matched
 * by its own lead ID. The dataset (META_CONVERSIONS_DATASET_ID) is created
 * once in Meta Events Manager, outside this codebase — there's no code path
 * that creates it. Not required for changing a lead's status locally; only
 * the push to Meta needs it. */
export function requireMetaConversionsEnv(): MetaConversionsEnv {
  const accessToken = env.META_ACCESS_TOKEN;
  const datasetId = env.META_CONVERSIONS_DATASET_ID;
  if (!accessToken || !datasetId) {
    throw new Error("Meta Conversions API for CRM isn't configured — set META_CONVERSIONS_DATASET_ID (and META_ACCESS_TOKEN).");
  }
  return { accessToken, datasetId };
}
