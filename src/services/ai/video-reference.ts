/**
 * Resolves which real-person reference photo (if any) each scene's image
 * generation should be conditioned on, for AI VIDEO generation only
 * (Meta Ads video ads + Social Media video posts) — image generation
 * never uses this. Driven entirely by Settings > Automation Defaults >
 * Video Character Reference (businesses.video_reference_*), not any
 * hardcoded file — replaces the old fixed character-references.ts, which
 * had a real bug: it picked one photo per product area instead of per
 * gender, so a "female" video always rendered with the male photo (and
 * vice versa for Social). Off by default; returns undefined (no
 * reference image) until both photos are uploaded and the toggle is on.
 */
interface BusinessVideoReferenceFields {
  video_reference_enabled?: boolean | null;
  video_reference_male_url?: string | null;
  video_reference_female_url?: string | null;
}

export function resolveVideoReferenceUrl(business: BusinessVideoReferenceFields | null | undefined, character: string | undefined): string | undefined {
  if (!business?.video_reference_enabled) return undefined;
  const url = character === "female" ? business.video_reference_female_url : business.video_reference_male_url;
  return url || undefined;
}
