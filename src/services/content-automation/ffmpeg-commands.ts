/**
 * ffmpeg commands for the Seedance clip (pure — the jobs run on the Upload-Post renderer, see ffmpeg-remux.ts).
 * With ONE input file the renderer requires the placeholders `{input}` and `{output}`
 * (it rejects `{input0}`: "full_command debe contener {input} y {output}"); with several it takes
 * `{input0}`, `{input1}`, … The renderer also rejects `;`, `|`, `&`, `$`, URLs and `movie=` in commands.
 */

import { END_AUDIO_FADE_SECONDS, END_CARD_LOGO_FADE_SECONDS, END_CARD_SECONDS, END_FADE_SECONDS } from "./video-spec";

export interface BrandVideoArgs {
  /** Overlay offset of the corner logo PNG from the top-right corner (videoLogo().offset). */
  offset: number;
  hasAudio: boolean;
  /** The clip's measured duration (s) — where the dip to black ends. */
  durationSeconds: number;
  /** The clip's frame rate, so the appended card matches it. */
  fps: number;
}

const sec = (n: number) => String(Math.max(0, Math.round(n * 1000) / 1000));

/**
 * The whole branded ending in ONE renderer job: input0 = the clip, input1 = the corner logo PNG
 * (already sized and shadowed, brand-logo.ts → videoLogo), input2 = the end-card PNG at the clip's size
 * (renderEndCard), looped for END_CARD_SECONDS at the clip's fps.
 *  - the corner logo is stamped top-right, then the picture (logo included) dips to black over the last END_FADE_SECONDS;
 *  - the card fades the white logo in from black, so black → logo is seamless, and is appended with concat;
 *  - the audio fades out over the last END_AUDIO_FADE_SECONDS and is padded with silence under the card.
 * The renderer blocks `;`, so chains are joined with `,` — valid in ffmpeg's filtergraph syntax when the
 * outputs are labelled. Re-encodes at CRF 18 (visually lossless at this size), moov atom first for Instagram.
 */
export function brandVideoCommand(a: BrandVideoArgs): string {
  const o = Math.max(0, Math.round(a.offset));
  const fps = a.fps > 0 ? Math.round(a.fps * 1000) / 1000 : 24;
  const graph = [
    `[0:v][1:v]overlay=W-w-${o}:${o}:format=auto,fade=t=out:st=${sec(a.durationSeconds - END_FADE_SECONDS)}:d=${END_FADE_SECONDS}:color=black,setsar=1,format=yuv420p[main]`,
    `[2:v]setsar=1,format=yuv420p,fade=t=in:st=0:d=${END_CARD_LOGO_FADE_SECONDS}:color=black[card]`,
    `[main][card]concat=n=2:v=1:a=0[v]`,
    ...(a.hasAudio ? [`[0:a]afade=t=out:st=${sec(a.durationSeconds - END_AUDIO_FADE_SECONDS)}:d=${END_AUDIO_FADE_SECONDS},apad=pad_dur=${END_CARD_SECONDS}[a]`] : []),
  ].join(",");
  return [
    `ffmpeg -y -i {input0} -i {input1} -loop 1 -framerate ${fps} -t ${END_CARD_SECONDS} -i {input2}`,
    `-filter_complex "${graph}"`,
    `-map "[v]"`, a.hasAudio ? `-map "[a]" -c:a aac -b:a 192k` : "",
    "-c:v libx264 -preset medium -crf 18 -movflags +faststart {output}",
  ].filter(Boolean).join(" ");
}

/**
 * One JPEG "contact sheet" of the 30 s clip for the media check: a frame every 5 s
 * (0, 5, …, 25 s), scaled to 360 px wide and tiled 3×2 in time order — one image the
 * vision reviewer can read, and one output file (the renderer returns a single file).
 */
export const FRAME_GRID_COMMAND = 'ffmpeg -y -i {input} -vf "fps=1/5,scale=360:-2,tile=3x2" -frames:v 1 -q:v 3 {output}';
