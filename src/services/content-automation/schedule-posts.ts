import type { ProposedSlot } from "./schedule";

/**
 * Turns a finished LIVE creative into its publishing records: one `social_posts`
 * row per platform (TikTok, Instagram, Facebook for social; LinkedIn for
 * LinkedIn) at the time the AI proposed, with that platform's fitted copy.
 * Pure — no I/O — so the rules are unit-tested; the database guard
 * (`social_posts_automation_guard`) re-enforces every invariant on insert.
 *
 * Testing content never gets a row (the guard rejects it too).
 */

export const SOCIAL_POST_PLATFORMS = ["tiktok", "instagram", "facebook"] as const;
/** A proposed time that is this close (or already past) is moved to now + RESCHEDULE_DELAY. */
export const MIN_LEAD_MS = 5 * 60_000;
export const RESCHEDULE_DELAY_MS = 15 * 60_000;
/** A proposed time more than this far in the past is not published at all. */
export const MAX_PAST_MS = 24 * 3_600_000;

export interface PlanContent {
  pipeline: string;
  contentType: string;
  environment: string;
  archived: boolean;
  generationStatus: string;
  currentRevisionId: string | null;
}

export interface PlanRevision {
  id: string;
  validation: string;
  caption: string | null;
  hashtags: string[] | null;
  proposedSchedule: ProposedSlot[] | null;
  platformPosts: Record<string, { text?: string; hashtags?: string[] } | undefined> | null;
}

export interface PlanConnection { id: string; platform: string; status: string }

export interface PlannedPost {
  platform: string;
  connectionId: string;
  connectionStatus: string;
  status: "scheduled" | "held";
  scheduledAt: string;
  timezone: string;
  format: "video" | "image" | "text_image";
  caption: string | null;
  hashtags: string[] | null;
  /** true when the AI's time had (nearly) passed and the post was moved to shortly from now. */
  rescheduled: boolean;
}

export type SkipReason = "no_proposed_time" | "no_connection" | "proposed_time_passed";
export interface PostPlan { posts: PlannedPost[]; skipped: { platform: string; reason: SkipReason }[]; notEligible: string | null }

export function platformsFor(pipeline: string): string[] {
  return pipeline === "linkedin" ? ["linkedin"] : pipeline === "social" ? [...SOCIAL_POST_PLATFORMS] : [];
}

export function formatFor(contentType: string): "video" | "image" | "text_image" {
  return contentType === "video" ? "video" : contentType === "image" ? "image" : "text_image";
}

/**
 * The posts this creative still needs. `existingPlatforms` already have a row and
 * are left alone (one row per creative × platform). `live` = automation enabled AND
 * mode Live right now: rows are created `scheduled`, otherwise `held` (released when
 * automation is Live again).
 */
export function planAutomationPosts(args: {
  content: PlanContent;
  revision: PlanRevision | null;
  connections: PlanConnection[];
  existingPlatforms: string[];
  live: boolean;
  now: number;
}): PostPlan {
  const { content, revision } = args;
  const none = (why: string): PostPlan => ({ posts: [], skipped: [], notEligible: why });
  if (content.environment !== "live") return none("not_live");
  if (content.archived) return none("archived");
  if (content.generationStatus !== "completed") return none("not_completed");
  if (!revision || content.currentRevisionId !== revision.id) return none("no_current_revision");
  if (revision.validation !== "valid") return none("revision_not_valid");
  const platforms = platformsFor(content.pipeline);
  if (!platforms.length) return none("pipeline_not_published_here");

  const posts: PlannedPost[] = [];
  const skipped: PostPlan["skipped"] = [];
  for (const platform of platforms) {
    if (args.existingPlatforms.includes(platform)) continue;
    const slot = (revision.proposedSchedule ?? []).find((s) => s.platform === platform);
    if (!slot || !Number.isFinite(Date.parse(slot.scheduled_at))) { skipped.push({ platform, reason: "no_proposed_time" }); continue; }

    // Prefer a connected account; otherwise any row for the platform. The post then exists, is
    // listed on the Dashboard as blocked ("Instagram isn't connected"), publishes if the account is
    // reconnected within 6 hours of its time, and is otherwise skipped with that reason.
    const conns = args.connections.filter((c) => c.platform === platform);
    const conn = conns.find((c) => c.status === "connected") ?? conns[0];
    if (!conn) { skipped.push({ platform, reason: "no_connection" }); continue; }

    const at = Date.parse(slot.scheduled_at);
    if (at < args.now - MAX_PAST_MS) { skipped.push({ platform, reason: "proposed_time_passed" }); continue; }
    const rescheduled = at < args.now + MIN_LEAD_MS;
    const copy = revision.platformPosts?.[platform];

    posts.push({
      platform,
      connectionId: conn.id,
      connectionStatus: conn.status,
      status: args.live ? "scheduled" : "held",
      scheduledAt: new Date(rescheduled ? args.now + RESCHEDULE_DELAY_MS : at).toISOString(),
      timezone: slot.timezone,
      format: formatFor(content.contentType),
      caption: copy?.text?.trim() ? copy.text : revision.caption,
      hashtags: copy?.hashtags ?? revision.hashtags,
      rescheduled,
    });
  }
  return { posts, skipped, notEligible: null };
}
