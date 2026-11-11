/**
 * ffmpeg commands for the Seedance clip (pure — the jobs run on the Upload-Post renderer, see ffmpeg-remux.ts).
 * With ONE input file the renderer requires the placeholders `{input}` and `{output}`
 * (it rejects `{input0}`: "full_command debe contener {input} y {output}"); with several it takes
 * `{input0}`, `{input1}`, … The renderer also rejects `;`, `|`, `&`, `$`, URLs and `movie=` in commands.
 */

/**
 * Stamps the Kangrooo logo on the clip: input0 = the clip, input1 = the logo PNG already sized and
 * shadowed for this video (brand-logo.ts → videoLogo), so the filter needs no scaling. The renderer
 * blocks `;`, so this must stay a single filter chain. Re-encodes the video (CRF 18, visually
 * lossless at this size), copies the audio untouched, and writes the moov atom first for Instagram.
 */
export function brandVideoCommand(offset: number, hasAudio: boolean): string {
  const o = Math.max(0, Math.round(offset));
  return [
    "ffmpeg -y -i {input0} -i {input1}",
    `-filter_complex "[0:v][1:v]overlay=W-w-${o}:${o}:format=auto,format=yuv420p[v]"`,
    `-map "[v]"`, hasAudio ? "-map 0:a -c:a copy" : "",
    "-c:v libx264 -preset medium -crf 18 -movflags +faststart {output}",
  ].filter(Boolean).join(" ");
}

/**
 * One JPEG "contact sheet" of the 30 s clip for the media check: a frame every 5 s
 * (0, 5, …, 25 s), scaled to 360 px wide and tiled 3×2 in time order — one image the
 * vision reviewer can read, and one output file (the renderer returns a single file).
 */
export const FRAME_GRID_COMMAND = 'ffmpeg -y -i {input} -vf "fps=1/5,scale=360:-2,tile=3x2" -frames:v 1 -q:v 3 {output}';
