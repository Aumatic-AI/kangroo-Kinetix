import { FFmpegService } from "@/services/ffmpeg";
import { FRAME_GRID_COMMAND, brandVideoCommand } from "./ffmpeg-commands";

/** Submits the logo overlay (+ faststart) for the Seedance clip; `logoUrl` is the pre-sized PNG from videoLogo(). */
export function submitBrandVideoJob(clipUrl: string, logoUrl: string, offset: number, hasAudio: boolean): Promise<string> {
  return FFmpegService.submitJob({ files: [clipUrl, logoUrl], command: brandVideoCommand(offset, hasAudio), outputExtension: "mp4" });
}

/** Submits the frame-grid extraction (one JPEG) used by the media check. */
export function submitFrameGridJob(url: string): Promise<string> {
  return FFmpegService.submitJob({ files: [url], command: FRAME_GRID_COMMAND, outputExtension: "jpg" });
}
