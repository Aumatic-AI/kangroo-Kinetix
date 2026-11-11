import type { MediaProbe, VideoProbe, ImageProbe } from "./media-probe";

/**
 * Per-platform media rules the social pipeline validates against BEFORE a
 * creative can become "valid" (spec §17.5). Publishing goes through Upload-Post,
 * so the video values come from its Video Format Requirements page
 * (docs.upload-post.com/api/video-requirements), checked 2026-11-03.
 *
 * House rules on top of the platform minimums: every social video is 9:16 with
 * an audio track. IMAGE limits are NOT from Upload-Post (its photo page wasn't
 * available) — they come from a third-party summary and Meta's documented
 * Instagram feed range (aspect 0.8–1.91, JPEG), so they're deliberately
 * conservative and marked unverified; re-check when publishing is built.
 */

export const SOCIAL_PLATFORM_IDS = ["instagram", "facebook", "tiktok"] as const;
export type SocialPlatformId = (typeof SOCIAL_PLATFORM_IDS)[number];

export interface VideoRules {
  minSeconds: number; maxSeconds: number;
  minWidth: number; minHeight: number; maxSide: number;
  fps: { min: number; max: number };
  maxBytes: number | null;
  videoCodecs: string[];              // sample-entry fourccs
  audioCodecs: string[];
  moovFirst: boolean;
}

export const VIDEO_RULES: Record<SocialPlatformId, VideoRules> = {
  instagram: { minSeconds: 3, maxSeconds: 900, minWidth: 0, minHeight: 0, maxSide: 1920, fps: { min: 23, max: 60 }, maxBytes: 300 * 1024 ** 2, videoCodecs: ["avc1", "hvc1", "hev1"], audioCodecs: ["mp4a"], moovFirst: true },
  facebook: { minSeconds: 3, maxSeconds: 90, minWidth: 480, minHeight: 854, maxSide: 4096, fps: { min: 24, max: 60 }, maxBytes: null, videoCodecs: ["avc1", "hvc1", "hev1", "vp09", "av01"], audioCodecs: ["mp4a"], moovFirst: false },
  tiktok: { minSeconds: 3, maxSeconds: 600, minWidth: 0, minHeight: 0, maxSide: 4096, fps: { min: 23, max: 60 }, maxBytes: 3 * 1024 ** 3, videoCodecs: ["avc1", "hvc1", "hev1"], audioCodecs: ["mp4a"], moovFirst: false },
};
const TIKTOK_MIN_SIDE = 360;
const NINE_SIXTEEN = 9 / 16;
const RATIO_TOLERANCE = 0.02;

export interface ImageRules { minAspect: number; maxAspect: number; maxBytes: number; formats: ("jpeg" | "png")[] }

export const IMAGE_RULES: Record<SocialPlatformId, ImageRules> = {
  instagram: { minAspect: 0.8, maxAspect: 1.91, maxBytes: 8 * 1024 ** 2, formats: ["jpeg"] },
  facebook: { minAspect: 0.5, maxAspect: 1.91, maxBytes: 4 * 1024 ** 2, formats: ["jpeg", "png"] },
  tiktok: { minAspect: 0.4, maxAspect: 2.5, maxBytes: 20 * 1024 ** 2, formats: ["jpeg"] },
};

export function checkVideoForPlatform(p: VideoProbe, platform: SocialPlatformId): string[] {
  const r = VIDEO_RULES[platform];
  const errs: string[] = [];
  const ratio = p.height ? p.width / p.height : 0;
  if (Math.abs(ratio - NINE_SIXTEEN) > RATIO_TOLERANCE) errs.push(`must be 9:16 (is ${p.width}×${p.height})`);
  if (!(p.durationSeconds > 0)) errs.push("duration could not be determined");
  else if (p.durationSeconds < r.minSeconds) errs.push(`shorter than ${r.minSeconds}s (${p.durationSeconds}s)`);
  else if (p.durationSeconds > r.maxSeconds) errs.push(`longer than ${r.maxSeconds}s (${p.durationSeconds}s)`);
  if (p.width < r.minWidth || p.height < r.minHeight) errs.push(`below ${r.minWidth}×${r.minHeight} (is ${p.width}×${p.height})`);
  if (platform === "tiktok" && Math.min(p.width, p.height) < TIKTOK_MIN_SIDE) errs.push(`side under ${TIKTOK_MIN_SIDE}px`);
  if (Math.max(p.width, p.height) > r.maxSide) errs.push(`side over ${r.maxSide}px`);
  if (p.fps !== null && (p.fps < r.fps.min - 0.5 || p.fps > r.fps.max + 0.5)) errs.push(`frame rate ${p.fps} fps outside ${r.fps.min}–${r.fps.max}`);
  if (r.maxBytes && p.sizeBytes > r.maxBytes) errs.push("file too large");
  if (p.videoCodec && !r.videoCodecs.includes(p.videoCodec)) errs.push(`video codec ${p.videoCodec} not supported`);
  if (!p.hasAudio) errs.push("no audio track");
  else if (p.audioCodec && !r.audioCodecs.includes(p.audioCodec)) errs.push(`audio codec ${p.audioCodec} not supported`);
  if (r.moovFirst && !p.moovBeforeMdat) errs.push("moov atom is not at the start of the file");
  return errs;
}

export function checkImageForPlatform(p: ImageProbe, platform: SocialPlatformId): string[] {
  const r = IMAGE_RULES[platform];
  const errs: string[] = [];
  const ratio = p.height ? p.width / p.height : 0;
  if (ratio < r.minAspect - 0.005 || ratio > r.maxAspect + 0.005) errs.push(`aspect ratio ${ratio.toFixed(2)} outside ${r.minAspect}–${r.maxAspect}`);
  if (!r.formats.includes(p.format)) errs.push(`${p.format.toUpperCase()} not accepted (needs ${r.formats.map((f) => f.toUpperCase()).join("/")})`);
  if (p.sizeBytes > r.maxBytes) errs.push("file too large");
  return errs;
}

export type PlatformChecks = Record<SocialPlatformId, string[]>;

/** Runs the media probe through all three social platforms. `ok` only if every one passes. */
export function checkSocialMedia(probe: MediaProbe): { ok: boolean; checks: PlatformChecks; errors: string[] } {
  const checks = {} as PlatformChecks;
  const errors: string[] = [];
  for (const platform of SOCIAL_PLATFORM_IDS) {
    const errs = probe.kind === "video" ? checkVideoForPlatform(probe, platform) : checkImageForPlatform(probe, platform);
    checks[platform] = errs;
    for (const e of errs) errors.push(`${platform}: ${e}`);
  }
  return { ok: errors.length === 0, checks, errors };
}
