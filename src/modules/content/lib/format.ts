import type { ContentType, MediaInfo, ProposedSlot } from "../types/content.types";

export const PLATFORM_LABEL: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", linkedin: "LinkedIn" };
export const TYPE_LABEL: Record<ContentType, string> = { video: "Video", image: "Image", text_image: "Text + image", blog: "Blog" };
export const PIPELINE_LABEL = { social: "TikTok · Instagram · Facebook", linkedin: "LinkedIn", blog: "Blog (display only)" } as const;

/** A proposed UTC instant, shown in the timezone it was scheduled for, e.g. "Tue, Nov 10, 7:00 PM EST". */
export function formatSlot(slot: Pick<ProposedSlot, "scheduled_at" | "timezone">): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: slot.timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
    }).format(new Date(slot.scheduled_at));
  } catch {
    return new Date(slot.scheduled_at).toUTCString();
  }
}

export function earliestSlot(slots: ProposedSlot[] | null | undefined): ProposedSlot | null {
  if (!slots?.length) return null;
  return [...slots].sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))[0];
}

/** "720×1280 · 24 fps · 28.0s · H.264 + AAC · 1.9 MB" for the media check line. */
export function describeMedia(m: MediaInfo): string {
  const codec = (c?: string | null) => (c === "avc1" ? "H.264" : c === "hvc1" || c === "hev1" ? "H.265" : c === "mp4a" ? "AAC" : c ?? null);
  const parts = [`${m.width}×${m.height}`];
  if (m.kind === "video") {
    if (m.fps) parts.push(`${m.fps} fps`);
    if (m.durationSeconds != null) parts.push(`${m.durationSeconds}s`);
    parts.push([codec(m.videoCodec), m.hasAudio ? codec(m.audioCodec) ?? "audio" : "no audio"].filter(Boolean).join(" + "));
  } else if (m.format) parts.push(m.format.toUpperCase());
  parts.push(m.sizeBytes >= 1024 ** 2 ? `${(m.sizeBytes / 1024 ** 2).toFixed(1)} MB` : `${Math.round(m.sizeBytes / 1024)} KB`);
  return parts.join(" · ");
}
