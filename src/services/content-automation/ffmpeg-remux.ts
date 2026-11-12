import { FFmpegService } from "@/services/ffmpeg";
import { FRAME_GRID_COMMAND, brandVideoCommand, type BrandVideoArgs } from "./ffmpeg-commands";

/** Submits the branded ending for the Seedance clip: corner logo, dip to black, end card (+ faststart). `logoUrl`/`cardUrl` are the pre-sized PNGs. */
export function submitBrandVideoJob(clipUrl: string, logoUrl: string, cardUrl: string, args: BrandVideoArgs): Promise<string> {
  return FFmpegService.submitJob({ files: [clipUrl, logoUrl, cardUrl], command: brandVideoCommand(args), outputExtension: "mp4" });
}

/** Submits the frame-grid extraction (one JPEG) used by the media check. */
export function submitFrameGridJob(url: string): Promise<string> {
  return FFmpegService.submitJob({ files: [url], command: FRAME_GRID_COMMAND, outputExtension: "jpg" });
}
