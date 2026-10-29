/**
 * Types for the Upload-Post API (https://docs.upload-post.com) — the
 * single publishing backend this app uses for all organic social posting.
 * Accounts themselves are connected on the Upload-Post dashboard, not
 * through our own OAuth (see services/social/oauth for that still-kept,
 * currently-unused-for-publishing alternative).
 */

/** Platforms this app actually supports end to end (Connected Accounts /
 * Posts). Upload-Post itself supports many more (reddit, discord, bluesky,
 * etc.) — not exposed in our UI, so not modeled here. */
export type UploadPostPlatform = "facebook" | "instagram" | "youtube" | "x" | "linkedin" | "tiktok";

export const SUPPORTED_UPLOAD_POST_PLATFORMS: UploadPostPlatform[] = ["facebook", "instagram", "youtube", "x", "linkedin", "tiktok"];

export interface UploadPostSocialAccount {
  username?: string;
  handle?: string;
  display_name?: string;
  social_images?: string;
}

/** A connected platform's value is an object when linked, and `null` or
 * `""` when not — Upload-Post is inconsistent about which, so treat both
 * as "not connected" (see `isAccountConnected`). */
export type UploadPostSocialAccountValue = UploadPostSocialAccount | null | "" | undefined;

export interface UploadPostProfile {
  username: string;
  created_at: string;
  social_accounts: Partial<Record<UploadPostPlatform, UploadPostSocialAccountValue>>;
}

export function isAccountConnected(value: UploadPostSocialAccountValue): value is UploadPostSocialAccount {
  return !!value && typeof value === "object";
}

export interface UploadPostResultEntry {
  success: boolean;
  url?: string;
  error?: string;
  [key: string]: any;
}

export interface UploadPostPublishResponse {
  success: boolean;
  results?: Record<string, UploadPostResultEntry>;
  request_id?: string;
  job_id?: string;
  scheduled_date?: string;
  message?: string;
  total_platforms?: number;
}

export type UploadPostJobStatus = "pending" | "queued" | "processing" | "in_progress" | "completed" | "failed" | "not_found";

export interface UploadPostStatusResult {
  platform: string;
  success?: boolean;
  message?: string;
  upload_timestamp?: string;
}

export interface UploadPostStatusResponse {
  request_id?: string;
  job_id?: string;
  status: UploadPostJobStatus;
  completed?: number;
  total?: number;
  results?: UploadPostStatusResult[];
  last_update?: string;
}

export interface UploadPostScheduledJob {
  job_id: string;
  scheduled_date: string;
  post_type: string;
  profile_username: string;
  title?: string;
  preview_url?: string;
}

export interface UploadPostFacebookPage {
  id: string;
  name: string;
  picture?: string;
}

export interface UploadPostLinkedInPage {
  id: string;
  name: string;
  picture?: string;
  vanityName?: string;
}

/** One platform's block from GET /api/analytics/{profile} — which of these
 * are actually populated varies per platform (e.g. Pinterest has no
 * likes/comments, YouTube has no reach) — always read through
 * `available_metrics`/`metric_labels` rather than assuming a field exists. */
export interface UploadPostProfileAnalytics {
  followers?: number;
  reach?: number;
  views?: number;
  impressions?: number;
  profileViews?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  pin_clicks?: number;
  outbound_clicks?: number;
  reach_timeseries?: { date: string; value: number }[];
  follower_demographics?: {
    age?: Record<string, number>;
    gender?: Record<string, number>;
    country?: Record<string, number>;
    city?: Record<string, number>;
  };
  available_metrics?: string[];
  metric_labels?: Record<string, string>;
  primary_impressions_field?: string;
}

export interface UploadPostTotalImpressions {
  success: boolean;
  total_impressions: number;
  per_platform?: Record<string, number>;
  per_day?: Record<string, number>;
}

export interface UploadPostCachedPost {
  post_id: string;
  platform: string;
  date: string;
  captured_at: string;
  metrics: { views?: number; likes?: number; comments?: number; favorites?: number; shares?: number; saves?: number };
  post_url?: string;
  media_type?: string;
  upload_timestamp?: string;
}

export interface UploadPostCachedPostsResponse {
  success: boolean;
  posts: UploadPostCachedPost[];
  next_cursor?: string;
  has_more?: boolean;
}
