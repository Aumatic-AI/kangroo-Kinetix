import { FFmpegService } from "./client";

/** The two orientations Kie's Seedance video model accepts — resolved to
 * the matching output pixel dimensions for the FFmpeg scale/pad filter.
 * Defaults to the original portrait shape for any caller that doesn't pass
 * one. */
function resolutionForAspectRatio(aspectRatio?: "16:9" | "9:16"): { width: number; height: number } {
  return aspectRatio === "16:9" ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
}

export interface StitchScenesOptions {
  clipUrls: string[];
  /** Omit for a silent/music-bed video; when present, mixed in as the one audio track. */
  audioUrl?: string | null;
  clipDurationSeconds?: number;
}

/**
 * Builds the multi-clip vertical-video concat FFmpeg command (scale/pad
 * every clip to 1080x1920, concat them in order, optionally mux in one
 * audio track) and submits it as an FFmpeg API job. Shared by the Meta
 * Ads and Social video pipelines — both stitch Kie-generated per-scene
 * clips into one final video the exact same way.
 *
 * Callers still own the actual step.sleep/step.run polling loop — Inngest
 * steps can't live inside an imported helper — this only removes the
 * duplicated command-building that used to be copy-pasted in both jobs.
 *
 * `outputDuration` used to be a pure assumption (`clipUrls.length x
 * clipDurationSeconds`) with no guarantee any given Kie clip actually came
 * back at exactly that length — generative video models commonly return a
 * clip a few tenths of a second short or long of what was requested. Each
 * clip is now force-conformed to exactly `clipDurationSeconds` before the
 * concat (`tpad` freeze-pads a short clip with its own last frame, `trim`
 * cuts a long one — applying both unconditionally, in that order, is a
 * standard way to land on an exact duration regardless of which direction
 * the input actually drifted), so `outputDuration` is now a real guarantee
 * instead of a hope. The audio track is `apad`-padded with silence so it
 * always covers the full output length even if the narration naturally
 * runs shorter than the scene count implies — the final `-t` still trims
 * anything longer, same as before. This narrows, but doesn't fully
 * eliminate, audio/video drift: the remaining source is that one
 * continuous narration track is laid over evenly-spaced fixed-length
 * scenes, while spoken sentences naturally vary in length — perfectly
 * mapping each line's real spoken duration to its own scene would need
 * per-line TTS with measured timestamps, a larger change than this fix.
 */
export async function submitSceneStitchJob({ clipUrls, audioUrl, clipDurationSeconds = 4 }: StitchScenesOptions): Promise<string> {
  const hasAudio = !!audioUrl;
  const outputDuration = clipUrls.length * clipDurationSeconds;

  const videoInputFlags = clipUrls.map((_, i) => `-i {input${i}}`).join(" ");
  const audioInputFlag = hasAudio ? ` -i {input${clipUrls.length}}` : "";
  const inputs = `${videoInputFlags}${audioInputFlag}`;

  const filterParts: string[] = [];
  clipUrls.forEach((_, i) => {
    filterParts.push(
      `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,tpad=stop_mode=clone:stop_duration=${clipDurationSeconds},trim=duration=${clipDurationSeconds},setpts=PTS-STARTPTS[v${i}]`
    );
  });
  const concatInputs = clipUrls.map((_, i) => `[v${i}]`).join("");
  filterParts.push(`${concatInputs}concat=n=${clipUrls.length}:v=1:a=0,format=yuv420p[v]`);
  if (hasAudio) filterParts.push(`[${clipUrls.length}:a]apad[aout]`);
  const filterComplex = filterParts.join(",");

  const audioMap = hasAudio ? `-map "[aout]" ` : "";
  const audioEncode = hasAudio ? `-c:a aac -b:a 192k -ar 44100 -ac 2 ` : `-an `;

  const fullCommand = `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[v]" ${audioMap}-t ${outputDuration.toFixed(2)} -c:v libx264 -preset superfast -crf 23 ${audioEncode}-avoid_negative_ts make_zero -movflags +faststart {output}`;

  return FFmpegService.submitJob({
    files: hasAudio ? [...clipUrls, audioUrl as string] : [...clipUrls],
    command: fullCommand,
    outputExtension: "mp4",
  });
}

export interface PerSceneClip {
  videoUrl: string;
  /** This scene's own narration clip — omit (or leave every clip's
   * audioUrl unset) for a silent/no-voiceover video. Mixed per-scene
   * audio/no-audio isn't supported — a video either has narration on every
   * scene or none at all, matching the audioStyle choice made once for the
   * whole video. */
  audioUrl?: string | null;
  /** This scene's exact target duration — already measured from its own
   * real narration length (see src/services/ai/audio-duration.ts) and
   * clamped to whatever the video model's own duration range allows, or a
   * fixed default when there's no audio to size it against. */
  durationSeconds: number;
}

/**
 * Per-scene alternative to submitSceneStitchJob, used by the Meta Ads video
 * pipeline only (Social's video pipeline still uses the original function
 * above, untouched). That original approach generates ONE continuous
 * narration track for the whole script, then lays it under N *uniformly*
 * fixed-length clips — the two are sized completely independently, so
 * naturally-varying spoken-line lengths routinely drift from the fixed
 * per-scene duration, leaving either a mid-word cutoff (narration too long
 * for the video) or a silent tail (narration too short) — see that
 * function's own doc comment, which already identifies the real fix as
 * "per-line TTS with measured timestamps... a larger change."
 *
 * This is that larger change: each scene gets its OWN narration clip,
 * generated and measured independently, and that scene's video clip is
 * requested at THAT exact duration — so every scene's audio and video are
 * already the same length by construction before stitching even starts.
 * Each clip (video and, if present, its own audio) is still force-conformed
 * to its target duration here (`tpad`/`trim` for video, `apad`/`atrim` for
 * audio) as a second safety net, since a generative video model can still
 * return a clip a few tenths of a second off whatever duration was
 * requested. Audio+video are then concatenated together as paired segments
 * (`concat=v=1:a=1`), not layered as a separate overlay — so the final
 * output's total length is simply the sum of already-exact per-scene
 * durations, never a mismatch to paper over with silence-padding or a
 * trailing `-t` cutoff.
 */
export async function submitPerSceneStitchJob(clips: PerSceneClip[], aspectRatio?: "16:9" | "9:16", logoUrl?: string | null): Promise<string> {
  const hasAudio = clips.some((c) => !!c.audioUrl);
  const { width, height } = resolutionForAspectRatio(aspectRatio);
  const hasLogo = !!logoUrl;
  const logoInputIndex = clips.length + (hasAudio ? clips.length : 0);

  const videoInputFlags = clips.map((_, i) => `-i {input${i}}`).join(" ");
  const audioInputFlags = hasAudio ? clips.map((_, i) => ` -i {input${clips.length + i}}`).join("") : "";
  const logoInputFlag = hasLogo ? ` -i {input${logoInputIndex}}` : "";
  const inputs = `${videoInputFlags}${audioInputFlags}${logoInputFlag}`;

  const filterParts: string[] = [];
  clips.forEach((clip, i) => {
    const d = clip.durationSeconds;
    filterParts.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,tpad=stop_mode=clone:stop_duration=${d},trim=duration=${d},setpts=PTS-STARTPTS[v${i}]`
    );
    if (hasAudio) {
      const audioInputIndex = clips.length + i;
      filterParts.push(`[${audioInputIndex}:a]apad,atrim=duration=${d},asetpts=PTS-STARTPTS[a${i}]`);
    }
  });

  // Watermark, applied once on the final concatenated video, not per scene —
  // a per-scene AI-rendered logo drifts in size/position/clarity every
  // scene since each is generated independently; an FFmpeg overlay is
  // pixel-identical on every frame, which is what a watermark actually needs.
  // Top-right corner, small (~8% of frame height) and semi-transparent
  // (70% opacity) — out of the way of the subject and any bottom captions.
  const concatVideoLabel = hasLogo ? "vbase" : "v";
  if (hasAudio) {
    const concatInputs = clips.map((_, i) => `[v${i}][a${i}]`).join("");
    filterParts.push(`${concatInputs}concat=n=${clips.length}:v=1:a=1[vraw][a]`);
    filterParts.push(`[vraw]format=yuv420p[${concatVideoLabel}]`);
  } else {
    const concatInputs = clips.map((_, i) => `[v${i}]`).join("");
    filterParts.push(`${concatInputs}concat=n=${clips.length}:v=1:a=0,format=yuv420p[${concatVideoLabel}]`);
  }
  if (hasLogo) {
    const logoHeight = Math.round((height * 0.08) / 2) * 2;
    const margin = Math.round(width * 0.03);
    filterParts.push(`[${logoInputIndex}:v]scale=-2:${logoHeight},format=rgba,colorchannelmixer=aa=0.7[wm]`);
    filterParts.push(`[vbase][wm]overlay=W-w-${margin}:${margin}[v]`);
  }
  const filterComplex = filterParts.join(",");

  const audioMap = hasAudio ? `-map "[a]" ` : "";
  const audioEncode = hasAudio ? `-c:a aac -b:a 192k -ar 44100 -ac 2 ` : `-an `;

  // No trailing `-t` cap — unlike submitSceneStitchJob, there's no
  // independent narration track that could run long or short of the video;
  // total length is just the sum of each already-exact scene duration.
  const fullCommand = `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[v]" ${audioMap}-c:v libx264 -preset superfast -crf 23 ${audioEncode}-avoid_negative_ts make_zero -movflags +faststart {output}`;

  const videoUrls = clips.map((c) => c.videoUrl);
  const audioUrls = hasAudio ? (clips.map((c) => c.audioUrl) as string[]) : [];
  const logoUrls = hasLogo ? [logoUrl as string] : [];

  return FFmpegService.submitJob({
    files: [...videoUrls, ...audioUrls, ...logoUrls],
    command: fullCommand,
    outputExtension: "mp4",
  });
}

export interface DownloadAndStoreVideoOptions {
  sourceUrl: string;
  /** Full object path within the `business_media` bucket, e.g.
   * `${businessId}/social/videos/${Date.now()}.mp4`. */
  storagePath: string;
}

export interface DownloadAndStoreVideoResult {
  publicUrl: string;
  sizeBytes: number;
}

/** Downloads a finished FFmpeg render (hosted on Upload-Post's own
 * storage) and re-uploads it into our own `business_media` bucket, so the
 * final asset is durable and reusable rather than depending on Upload-Post
 * retaining the file. `supabase` is whatever service-role client the
 * calling job already created. */
export async function downloadAndStoreVideo(supabase: any, { sourceUrl, storagePath }: DownloadAndStoreVideoOptions): Promise<DownloadAndStoreVideoResult> {
  const response = await fetch(sourceUrl, { headers: FFmpegService.getHeaders() });
  if (!response.ok) throw new Error(`Failed to download stitched video: ${response.status}`);
  const videoBuffer = await response.arrayBuffer();

  const { error } = await supabase.storage.from("business_media").upload(storagePath, videoBuffer, { contentType: "video/mp4" });
  if (error) throw new Error("Video upload to Supabase failed: " + error.message);

  const { data } = supabase.storage.from("business_media").getPublicUrl(storagePath);
  return { publicUrl: data.publicUrl, sizeBytes: videoBuffer.byteLength };
}
