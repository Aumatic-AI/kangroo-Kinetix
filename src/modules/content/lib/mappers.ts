import type { GalleryItem, RevisionSummary, RevisionQa, ProposedSlot, MediaInfo, PlatformPostInfo, BlogDoc, BlogBlock } from "../types/content.types";

/** content_decision.blog as written by the blog generator (snake_case, with generation internals). */
interface StoredBlogRow {
  title: string; slug: string; meta_description: string; format: string; format_reason?: string; angle: string; reason?: string;
  tags?: string[]; blocks: BlogBlock[]; wordCount?: number;
  images: { id: string; role: "hero" | "inline"; alt: string; caption?: string; url: string | null }[];
  observations?: { observations?: string[] } | null;
}

function toBlogDoc(b: StoredBlogRow | null | undefined): BlogDoc | null {
  if (!b || !Array.isArray(b.blocks)) return null;
  return {
    title: b.title, slug: b.slug, metaDescription: b.meta_description, format: b.format, formatReason: b.format_reason ?? "", angle: b.angle,
    reason: b.reason ?? "", tags: b.tags ?? [], blocks: b.blocks, wordCount: b.wordCount ?? 0,
    images: (b.images ?? []).map((i) => ({ id: i.id, role: i.role, alt: i.alt, caption: i.caption ?? "", url: i.url })),
    observations: b.observations?.observations ?? [],
  };
}

export interface RevisionRow {
  id: string; property_content_id: string; revision_number: number; caption: string | null; hashtags: string[] | null; script: string | null;
  video_format: string | null; video_duration: number | string | null; format_reason: string | null; validation_status: string;
  validation_errors: unknown; media_asset_id: string | null; proposed_schedule: unknown; generation_prompt: string | null; created_at: string;
  content_decision?: {
    media?: MediaInfo | null; platformPosts?: Record<string, PlatformPostInfo> | null; blog?: StoredBlogRow | null;
    qa?: { brief?: (NonNullable<RevisionQa["brief"]> & { rounds?: number }) | null; media?: RevisionQa["media"] } | null;
    assignment?: { objective: string; framework: string; hook_type: string } | null;
    retry_of?: string | null;
  } | null;
}

function toQa(d: RevisionRow["content_decision"]): RevisionQa | null {
  if (!d || (!d.qa && !d.assignment)) return null;
  const b = d.qa?.brief;
  return {
    brief: b ? { score: b.score, passed: b.passed, rounds: b.rounds ?? 1, issues: b.issues ?? [] } : null,
    media: d.qa?.media ?? null,
    assignment: d.assignment ? { objective: d.assignment.objective, framework: d.assignment.framework, hookType: d.assignment.hook_type } : null,
    retryOf: d.retry_of ?? null,
  };
}
export interface ContentRow {
  id: string; property_id: string; pipeline_type: string; content_type: string; environment: string; generation_status: string;
  created_at: string; current_revision_id: string | null;
}

export function toRevision(r: RevisionRow, media: Map<string, { url: string | null; type: "image" | "video" | null }>): RevisionSummary {
  const m = r.media_asset_id ? media.get(r.media_asset_id) : undefined;
  return {
    id: r.id, number: r.revision_number, caption: r.caption, hashtags: r.hashtags ?? [], script: r.script,
    videoFormat: r.video_format === "single_clip" ? r.video_format : null,
    videoDuration: r.video_duration == null ? null : Number(r.video_duration),
    formatReason: r.format_reason, validation: r.validation_status as RevisionSummary["validation"],
    validationErrors: Array.isArray(r.validation_errors) ? (r.validation_errors as string[]) : null,
    mediaUrl: m?.url ?? null, mediaType: m?.type ?? null,
    proposedSchedule: Array.isArray(r.proposed_schedule) ? (r.proposed_schedule as ProposedSlot[]) : null,
    platformPosts: r.content_decision?.platformPosts ?? null, mediaInfo: r.content_decision?.media ?? null,
    blog: toBlogDoc(r.content_decision?.blog),
    qa: toQa(r.content_decision),
    guidance: r.generation_prompt, createdAt: r.created_at,
  };
}

export function toItem(c: ContentRow, revs: RevisionSummary[], property: { title: string; city: string | null } | undefined): GalleryItem {
  const current = revs.find((r) => r.id === c.current_revision_id) ?? null;
  const latestAttempt = current ? null
    : revs.filter((r) => r.mediaUrl).reduce<RevisionSummary | null>((a, r) => (!a || r.number > a.number ? r : a), null);
  return {
    id: c.id, propertyId: c.property_id, propertyTitle: property?.title ?? "Unknown property", city: property?.city ?? null,
    pipeline: c.pipeline_type as GalleryItem["pipeline"], contentType: c.content_type as GalleryItem["contentType"],
    environment: c.environment as GalleryItem["environment"], generationStatus: c.generation_status as GalleryItem["generationStatus"],
    createdAt: c.created_at, revisionCount: revs.length, regenerating: revs.some((r) => r.validation === "pending") && !!current, current, latestAttempt,
  };
}
