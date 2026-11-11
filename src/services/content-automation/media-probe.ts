/**
 * Dependency-free inspection of generated media, so validation checks what was
 * ACTUALLY produced (duration, size, audio track, codec, moov placement) rather
 * than what we asked the model for. Reads only container headers — no decoding.
 * Pure functions over bytes, so they run in Inngest and are unit-tested.
 */

export interface VideoProbe {
  kind: "video";
  sizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  /** Average frame rate from the sample table; null if it can't be derived. */
  fps: number | null;
  videoCodec: string | null;   // sample-entry fourcc, e.g. "avc1", "hvc1"
  audioCodec: string | null;   // e.g. "mp4a"
  hasAudio: boolean;
  /** moov atom precedes mdat — required by Instagram (and needed for fast start). */
  moovBeforeMdat: boolean;
}

export interface ImageProbe {
  kind: "image";
  sizeBytes: number;
  format: "jpeg" | "png";
  width: number;
  height: number;
}

export type MediaProbe = VideoProbe | ImageProbe;

interface Box { type: string; start: number; payload: number; end: number }

const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const i32 = (b: Uint8Array, o: number) => u32(b, o) | 0;
const u64 = (b: Uint8Array, o: number) => u32(b, o) * 2 ** 32 + u32(b, o + 4);
const fourcc = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

/** Iterates the child boxes in [from, to). Stops at the first malformed box. */
function* boxes(b: Uint8Array, from: number, to: number): Generator<Box> {
  let o = from;
  while (o + 8 <= to) {
    let size = u32(b, o);
    const type = fourcc(b, o + 4);
    let header = 8;
    if (size === 1) { if (o + 16 > to) return; size = u64(b, o + 8); header = 16; }
    else if (size === 0) size = to - o;
    if (size < header || o + size > to) return;
    yield { type, start: o, payload: o + header, end: o + size };
    o += size;
  }
}

const child = (b: Uint8Array, parent: Box, type: string): Box | null => {
  for (const c of boxes(b, parent.payload, parent.end)) if (c.type === type) return c;
  return null;
};

export function probeMp4(input: ArrayBuffer | Uint8Array): VideoProbe {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  let moov: Box | null = null;
  let moovIndex = -1;
  let mdatIndex = -1;
  let i = 0;
  for (const box of boxes(b, 0, b.length)) {
    if (box.type === "moov" && !moov) { moov = box; moovIndex = i; }
    if (box.type === "mdat" && mdatIndex === -1) mdatIndex = i;
    i++;
  }
  if (!moov) throw new Error("not a valid MP4: no moov atom");

  let movieDuration = 0;
  const mvhd = child(b, moov, "mvhd");
  if (mvhd) {
    const v = b[mvhd.payload];
    const timescale = v === 1 ? u32(b, mvhd.payload + 20) : u32(b, mvhd.payload + 12);
    const dur = v === 1 ? u64(b, mvhd.payload + 24) : u32(b, mvhd.payload + 16);
    if (timescale > 0) movieDuration = dur / timescale;
    // Fragmented MP4: mvhd.duration is 0 and the real length is in mvex/mehd.
    if (movieDuration === 0 && timescale > 0) {
      const mvex = child(b, moov, "mvex");
      const mehd = mvex && child(b, mvex, "mehd");
      if (mehd) movieDuration = (b[mehd.payload] === 1 ? u64(b, mehd.payload + 4) : u32(b, mehd.payload + 4)) / timescale;
    }
  }

  let width = 0, height = 0, fps: number | null = null, videoCodec: string | null = null, audioCodec: string | null = null;
  let hasVideo = false, hasAudio = false;
  let videoTrackDuration = 0;

  for (const trak of boxes(b, moov.payload, moov.end)) {
    if (trak.type !== "trak") continue;
    const mdia = child(b, trak, "mdia");
    const hdlr = mdia && child(b, mdia, "hdlr");
    if (!mdia || !hdlr) continue;
    const handler = fourcc(b, hdlr.payload + 8);

    const stbl = (() => { const minf = child(b, mdia, "minf"); return minf && child(b, minf, "stbl"); })();
    const stsd = stbl && child(b, stbl, "stsd");
    const entry = stsd && stsd.payload + 16 <= stsd.end ? fourcc(b, stsd.payload + 12) : null;

    if (handler === "soun") { hasAudio = true; audioCodec = entry; continue; }
    if (handler !== "vide" || hasVideo) continue;
    hasVideo = true;
    videoCodec = entry;

    const tkhd = child(b, trak, "tkhd");
    if (tkhd) {
      const v = b[tkhd.payload];
      const base = v === 1 ? 52 : 40;              // start of the 3×3 matrix
      const a = Math.abs(i32(b, tkhd.payload + base));       // matrix a
      const bb = Math.abs(i32(b, tkhd.payload + base + 4));  // matrix b
      const wOff = tkhd.payload + base + 36;
      const w = Math.round(u32(b, wOff) / 65536);
      const h = Math.round(u32(b, wOff + 4) / 65536);
      // A 90°/270° rotation matrix has |a| ≈ 0 and |b| ≈ 1 — displayed size swaps.
      const rotated = a < bb;
      width = rotated ? h : w;
      height = rotated ? w : h;
    }

    const mdhd = child(b, mdia, "mdhd");
    const stts = stbl && child(b, stbl, "stts");
    if (mdhd) {
      const v = b[mdhd.payload];
      const ts = v === 1 ? u32(b, mdhd.payload + 20) : u32(b, mdhd.payload + 12);
      const dur = v === 1 ? u64(b, mdhd.payload + 24) : u32(b, mdhd.payload + 16);
      if (ts > 0) videoTrackDuration = dur / ts;
    }
    if (stts && videoTrackDuration > 0) {
      const n = u32(b, stts.payload + 4);
      let samples = 0;
      for (let k = 0; k < n && stts.payload + 8 + k * 8 + 8 <= stts.end; k++) samples += u32(b, stts.payload + 8 + k * 8);
      if (samples > 0) fps = Math.round((samples / videoTrackDuration) * 100) / 100;
    }
  }

  if (!hasVideo) throw new Error("MP4 has no video track");
  const durationSeconds = Math.round((movieDuration || videoTrackDuration) * 100) / 100;
  return {
    kind: "video", sizeBytes: b.length, durationSeconds, width, height, fps, videoCodec, audioCodec, hasAudio,
    moovBeforeMdat: mdatIndex === -1 || moovIndex < mdatIndex,
  };
}

export function probeImage(input: ArrayBuffer | Uint8Array): ImageProbe {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  // PNG
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { kind: "image", sizeBytes: b.length, format: "png", width: u32(b, 16), height: u32(b, 20) };
  }
  // JPEG: walk markers to the first start-of-frame
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o + 4 <= b.length) {
      if (b[o] !== 0xff) { o++; continue; }
      const marker = b[o + 1];
      if (marker === 0xff) { o++; continue; }                       // fill byte
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { o += 2; continue; }   // no length
      const len = u16(b, o + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof && o + 9 <= b.length) {
        return { kind: "image", sizeBytes: b.length, format: "jpeg", height: u16(b, o + 5), width: u16(b, o + 7) };
      }
      o += 2 + len;
    }
    throw new Error("JPEG has no frame header");
  }
  throw new Error("unsupported or corrupted image (expected JPEG or PNG)");
}

export function probeMedia(buf: ArrayBuffer | Uint8Array, type: "image" | "video"): MediaProbe {
  return type === "video" ? probeMp4(buf) : probeImage(buf);
}
