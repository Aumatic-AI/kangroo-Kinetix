import { parseBuffer } from "music-metadata";

/** Real, measured duration of an audio buffer (MP3, from ElevenLabs) — not
 * an estimate from word count or a byte-size/bitrate guess. This is the
 * ground truth the per-scene video pipeline sizes each scene's clip
 * against, which is what makes audio and video land in sync by
 * construction rather than by hoping a words-per-second assumption holds. */
export async function getAudioDurationSeconds(buffer: Buffer): Promise<number> {
  const metadata = await parseBuffer(buffer, { mimeType: "audio/mpeg" });
  const duration = metadata.format.duration;
  if (!duration || !Number.isFinite(duration)) {
    throw new Error("Could not determine audio duration from the generated buffer");
  }
  return duration;
}
