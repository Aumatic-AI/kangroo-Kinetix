import sharp from "sharp";
import { KANGROOO_LOGO_PNG_BASE64 } from "./brand-logo-data";

/**
 * The Kangrooo logo stamped in the top-right corner of every generated image and video.
 * Done in code after generation (never asked of the image/video model, which would misdraw it).
 * - Images: composited here with sharp. The logo is dark on a light corner and white (with a
 *   soft shadow) on a dark one, judged from the pixels under it.
 * - Videos: the frames change, so the logo is always white with a soft shadow; this module renders
 *   that PNG at the right size and the FFmpeg renderer overlays it (see ffmpeg-commands.ts).
 */

export const LOGO_VERSION = "v1";   // bump when the logo or its styling changes (it's part of the cached video-logo path)
const LOGO_RATIO = 65 / 283;        // height / width of the source logo
const DARK = { r: 16, g: 17, b: 20 };
const LIGHT = { r: 255, g: 255, b: 255 };
/** Average luminance (0–255) above which the corner counts as light and gets the dark logo. */
export const LIGHT_CORNER_LUMINANCE = 150;

export type LogoTone = "dark" | "light";

/** Logo width and corner margin for a frame of this width (px). Videos are small (480 px), so the logo is a bit larger there. */
export function logoPlacement(frameWidth: number, kind: "image" | "video") {
  const width = Math.round(frameWidth * (kind === "video" ? 0.26 : 0.2));
  return { width, height: Math.round(width * LOGO_RATIO), margin: Math.round(frameWidth * (kind === "video" ? 0.05 : 0.04)) };
}

/** Shadow padding around a light logo, so its blur isn't clipped. */
const shadowPad = (width: number) => Math.max(4, Math.round(width * 0.06));

/** The logo at `width` px in one tone; a light logo gets a soft dark shadow (padded by shadowPad on every side). */
export async function renderLogo(width: number, tone: LogoTone): Promise<{ png: Buffer; pad: number; width: number; height: number }> {
  const height = Math.round(width * LOGO_RATIO);
  const alpha = await sharp(Buffer.from(KANGROOO_LOGO_PNG_BASE64, "base64"))
    .resize(width, height, { kernel: "lanczos3" }).extractChannel("alpha").toBuffer();
  const solid = (c: { r: number; g: number; b: number }) =>
    sharp({ create: { width, height, channels: 3, background: c } }).joinChannel(alpha).png().toBuffer();

  const logo = await solid(tone === "dark" ? DARK : LIGHT);
  if (tone === "dark") return { png: logo, pad: 0, width, height };

  const pad = shadowPad(width);
  const shadow = await sharp(await solid({ r: 0, g: 0, b: 0 }))
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .blur(Math.max(1.2, width / 110))
    .linear([1, 1, 1, 0.55], [0, 0, 0, 0])   // soften the shadow's opacity
    .png().toBuffer();
  const png = await sharp(shadow).composite([{ input: logo, left: pad, top: pad }]).png().toBuffer();
  return { png, pad, width, height };
}

/** Picks the logo tone from the average luminance of the corner it will sit on. */
export function toneFor(luminance: number): LogoTone {
  return luminance > LIGHT_CORNER_LUMINANCE ? "dark" : "light";
}

export interface ImageLogo { tone: LogoTone; width: number; left: number; top: number; cornerLuminance: number; version: string }

/** Stamps the logo in the top-right corner of an image; returns a JPEG and where/how it was placed. */
export async function brandImage(input: Buffer): Promise<{ buffer: Buffer; logo: ImageLogo }> {
  const base = sharp(input).rotate();   // apply any EXIF orientation first, so "top-right" is the visible top-right
  const { data: oriented, info } = await base.toBuffer({ resolveWithObject: true });
  const { width, height, margin } = logoPlacement(info.width, "image");
  const left = info.width - margin - width, top = margin;

  // Luminance of the area the logo covers (Rec. 601 weights on the channel means).
  // stats() reads the INPUT image and ignores a chained extract(), so the corner is cut out to a buffer first.
  const corner = await sharp(oriented).extract({ left, top, width, height: Math.min(height, info.height - top) }).toBuffer();
  const stats = await sharp(corner).stats();
  const [r, g, b] = stats.channels.map((c) => c.mean);
  const cornerLuminance = Math.round(0.299 * r + 0.587 * (g ?? r) + 0.114 * (b ?? r));
  const tone = toneFor(cornerLuminance);

  const logo = await renderLogo(width, tone);
  const buffer = await sharp(oriented)
    .composite([{ input: logo.png, left: left - logo.pad, top: top - logo.pad }])
    .jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  return { buffer, logo: { tone, width, left, top, cornerLuminance, version: LOGO_VERSION } };
}

/** The white, shadowed logo PNG for a video of this width, and the overlay offset from the top-right corner. */
export async function videoLogo(videoWidth: number): Promise<{ png: Buffer; offset: number; width: number }> {
  const { width, margin } = logoPlacement(videoWidth, "video");
  const logo = await renderLogo(width, "light");
  // The PNG carries `pad` px of shadow on each side; offset so the logo itself sits `margin` px from the edges.
  return { png: logo.png, offset: margin - logo.pad, width };
}
