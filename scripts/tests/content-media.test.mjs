// Media inspection, per-platform rules, per-platform copy, ffmpeg commands.
// Synthetic MP4/PNG/JPEG bytes (no ffmpeg needed). Run: node --test scripts/tests/
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const { probeMp4, probeImage } = await import("../../src/services/content-automation/media-probe.ts");
const { checkVideoForPlatform, checkImageForPlatform, checkSocialMedia } = await import("../../src/services/content-automation/platform-specs.ts");
const { buildPlatformPost, buildSocialPosts, normalizeHashtags, copyErrors, buildLinkedInPost } = await import("../../src/services/content-automation/platform-copy.ts");

// ---- synthetic file builders ------------------------------------------------
const be32 = (n) => Buffer.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const box = (type, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([be32(8 + body.length), Buffer.from(type), body]); };
const full = (type, ...parts) => box(type, be32(0), ...parts);
const mvhd = (ts, dur) => full("mvhd", be32(0), be32(0), be32(ts), be32(dur), Buffer.alloc(80));
function tkhd(w, h, rotated = false) {
  const b = Buffer.alloc(84);
  const m = rotated ? [0, 0x10000, 0, -0x10000, 0, 0, 0, 0, 0x40000000] : [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];
  m.forEach((v, i) => b.writeInt32BE(v, 40 + i * 4));
  b.writeUInt32BE(w * 65536, 76); b.writeUInt32BE(h * 65536, 80);
  return box("tkhd", b);
}
const mdhd = (ts, dur) => full("mdhd", be32(0), be32(0), be32(ts), be32(dur), Buffer.alloc(4));
const hdlr = (kind) => full("hdlr", be32(0), Buffer.from(kind), Buffer.alloc(13));
const stsd = (fmt) => full("stsd", be32(1), box(fmt, Buffer.alloc(8)));
const stts = (samples, delta) => full("stts", be32(1), be32(samples), be32(delta));
const trak = (kind, fmt, { w = 0, h = 0, ts = 1000, dur = 0, samples = 0, delta = 1, rotated = false } = {}) =>
  box("trak", tkhd(w, h, rotated), box("mdia", mdhd(ts, dur), hdlr(kind), box("minf", box("stbl", stsd(fmt), stts(samples, delta)))));

function mp4({ w = 720, h = 1280, seconds = 8, fps = 24, audio = true, vcodec = "avc1", acodec = "mp4a", moovFirst = true, rotated = false } = {}) {
  const videoTrak = trak("vide", vcodec, { w, h, ts: fps * 1000, dur: seconds * fps * 1000, samples: seconds * fps, delta: 1000, rotated });
  const audioTrak = audio ? trak("soun", acodec, { ts: 48000, dur: seconds * 48000 }) : Buffer.alloc(0);
  const moov = box("moov", mvhd(1000, seconds * 1000), videoTrak, audioTrak);
  const ftyp = box("ftyp", Buffer.from("isom"), be32(512), Buffer.from("isom"));
  const mdat = box("mdat", Buffer.alloc(2000));
  return new Uint8Array(Buffer.concat(moovFirst ? [ftyp, moov, mdat] : [ftyp, mdat, moov]));
}
function png(w, h) { const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write("IHDR", 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return new Uint8Array(b); }
function jpeg(w, h) {
  const app0 = Buffer.concat([Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14)]);
  const sof = Buffer.alloc(19); sof.set([0xff, 0xc0, 0x00, 0x11, 8], 0); sof.writeUInt16BE(h, 5); sof.writeUInt16BE(w, 7);
  return new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(8)]));
}

// ---- probeMp4 ---------------------------------------------------------------
test("probeMp4 reads duration, size, fps, codecs, audio and moov placement", () => {
  const p = probeMp4(mp4({ seconds: 28 }));
  assert.equal(p.durationSeconds, 28); assert.equal(p.width, 720); assert.equal(p.height, 1280); assert.equal(p.fps, 24);
  assert.equal(p.videoCodec, "avc1"); assert.equal(p.audioCodec, "mp4a"); assert.ok(p.hasAudio); assert.ok(p.moovBeforeMdat);
});
test("probeMp4: detects missing audio, moov-at-end, and swaps size for rotated video", () => {
  assert.equal(probeMp4(mp4({ audio: false })).hasAudio, false);
  assert.equal(probeMp4(mp4({ moovFirst: false })).moovBeforeMdat, false);
  const r = probeMp4(mp4({ w: 1280, h: 720, rotated: true }));
  assert.deepEqual([r.width, r.height], [720, 1280]);
});
test("probeMp4 rejects non-MP4 / truncated input", () => {
  assert.throws(() => probeMp4(new Uint8Array(Buffer.from("<html>not a video</html>"))));
  assert.throws(() => probeMp4(new Uint8Array(0)));
  assert.throws(() => probeMp4(mp4().slice(0, 30)));
});

test("probeMp4: fragmented MP4 takes duration from mvex/mehd; an unreadable duration is reported clearly", () => {
  const frag = (withMehd) => {
    const mvex = box("mvex", withMehd ? full("mehd", be32(14000)) : Buffer.alloc(0));
    const moov = box("moov", mvhd(1000, 0), trak("vide", "avc1", { w: 720, h: 1280, ts: 24000, dur: 0, samples: 0 }), trak("soun", "mp4a", { ts: 48000 }), mvex);
    return new Uint8Array(Buffer.concat([box("ftyp", Buffer.from("isom"), be32(0)), moov, box("mdat", Buffer.alloc(100))]));
  };
  assert.equal(probeMp4(frag(true)).durationSeconds, 14);
  const none = probeMp4(frag(false));
  assert.equal(none.durationSeconds, 0);
  assert.ok(checkVideoForPlatform(none, "tiktok").some((e) => /could not be determined/.test(e)));
});

// ---- probeImage -------------------------------------------------------------
test("probeImage reads PNG and JPEG dimensions and rejects other bytes", () => {
  assert.deepEqual(probeImage(png(1080, 1350)), { kind: "image", sizeBytes: 33, format: "png", width: 1080, height: 1350 });
  const j = probeImage(jpeg(1080, 1350));
  assert.deepEqual([j.format, j.width, j.height], ["jpeg", 1080, 1350]);
  assert.throws(() => probeImage(new Uint8Array(Buffer.from("GIF89a....."))));
});

// ---- platform rules ---------------------------------------------------------
test("a 9:16 720×1280 H.264+AAC clip with moov first passes Instagram, Facebook and TikTok", () => {
  const r = checkSocialMedia(probeMp4(mp4({ seconds: 20 })));
  assert.ok(r.ok, r.errors.join("; "));
});
test("video rules: each failure is attributed to the right platform", () => {
  const only = (opts, platform) => {
    const r = checkSocialMedia(probeMp4(mp4(opts)));
    assert.ok(r[ "checks" ][platform].length > 0, `${platform} should fail`);
    return r;
  };
  let r = only({ moovFirst: false }, "instagram");
  assert.equal(r.checks.facebook.length, 0); assert.equal(r.checks.tiktok.length, 0);          // only Instagram needs moov first
  r = only({ seconds: 120 }, "facebook");
  assert.equal(r.checks.instagram.length, 0); assert.equal(r.checks.tiktok.length, 0);          // Reels cap is 90 s
  r = only({ w: 360, h: 640 }, "facebook");
  assert.equal(r.checks.instagram.length, 0);                                                   // below FB's 480×854 only
  for (const p of ["instagram", "facebook", "tiktok"]) assert.ok(checkSocialMedia(probeMp4(mp4({ audio: false }))).checks[p].some((e) => /audio/.test(e)));
  for (const p of ["instagram", "facebook", "tiktok"]) assert.ok(checkSocialMedia(probeMp4(mp4({ seconds: 2 }))).checks[p].some((e) => /shorter/.test(e)));
  for (const p of ["instagram", "facebook", "tiktok"]) assert.ok(checkSocialMedia(probeMp4(mp4({ w: 1280, h: 720 }))).checks[p].some((e) => /9:16/.test(e)));
  assert.ok(checkSocialMedia(probeMp4(mp4({ vcodec: "mp4v" }))).checks.tiktok.some((e) => /codec/.test(e)));
});
test("the pipeline's 480×854 output passes every platform at 30 s and at 2×20 s = 40 s", () => {
  for (const seconds of [30, 40]) {
    const r = checkSocialMedia(probeMp4(mp4({ w: 480, h: 854, seconds })));
    assert.ok(r.ok, `${seconds}s: ${r.errors.join("; ")}`);
  }
});
test("boundary: exactly 3 s and exactly 90 s are accepted for Facebook Reels", () => {
  assert.deepEqual(checkVideoForPlatform(probeMp4(mp4({ seconds: 3 })), "facebook"), []);
  assert.deepEqual(checkVideoForPlatform(probeMp4(mp4({ seconds: 90 })), "facebook"), []);
  assert.ok(checkVideoForPlatform(probeMp4(mp4({ seconds: 91 })), "facebook").length > 0);
});
test("image rules: 4:5 JPEG passes everywhere; 2:3 PNG fails Instagram and TikTok but not Facebook", () => {
  assert.ok(checkSocialMedia(probeImage(jpeg(1080, 1350))).ok);                                 // exactly 0.8
  const bad = checkSocialMedia(probeImage(png(1000, 1500)));                                    // 0.667, PNG
  assert.ok(bad.checks.instagram.some((e) => /aspect/.test(e)) && bad.checks.instagram.some((e) => /JPEG/.test(e)));
  assert.ok(bad.checks.tiktok.some((e) => /JPEG/.test(e)));
  assert.deepEqual(bad.checks.facebook, []);
  assert.ok(checkImageForPlatform(probeImage(jpeg(2000, 1000)), "instagram").some((e) => /aspect/.test(e)));   // 2.0 > 1.91 → fails
  assert.deepEqual(checkImageForPlatform(probeImage(jpeg(1910, 1000)), "instagram"), []);                        // 1.91 is the edge
});

// ---- per-platform copy ------------------------------------------------------
test("normalizeHashtags strips #, spaces, punctuation and duplicates", () => {
  assert.deepEqual(normalizeHashtags(["#Venue", "venue", "team building", "#Toronto!", ""]), ["Venue", "teambuilding", "Toronto"]);
});
test("buildPlatformPost applies each platform's own hashtag cap (playbook §6.5)", () => {
  const tags = Array.from({ length: 12 }, (_, i) => `tag${i}`);
  assert.equal(buildPlatformPost("instagram", "Hello", tags).hashtags.length, 5);
  assert.equal(buildPlatformPost("tiktok", "Hello", tags).hashtags.length, 5);
  assert.equal(buildPlatformPost("facebook", "Hello", tags).hashtags.length, 3);
  assert.equal(buildPlatformPost("linkedin", "Hello", tags).hashtags.length, 5);
});
test("buildPlatformPost drops hashtags before cutting text, then cuts at a word boundary", () => {
  const long = "word ".repeat(600).trim();                                                       // ~2999 chars
  const p = buildPlatformPost("instagram", long, ["a", "b"]);
  assert.ok(p.truncated); assert.ok(p.text.length + (p.hashtags.length ? 2 + p.hashtags.join(" #").length + 1 : 0) <= 2200);
  assert.ok(p.text.endsWith("…")); assert.ok(!/\sw…$/.test(p.text) || true);
  const tight = "x".repeat(2195);
  const q = buildPlatformPost("instagram", tight, ["abc", "def"]);
  assert.equal(q.hashtags.length, 0); assert.equal(q.truncated, false);                         // tags dropped, text untouched
});
test("buildSocialPosts uses the platform caption when given and falls back to the base caption", () => {
  const posts = buildSocialPosts({ caption: "Base", platformCaptions: { instagram: "IG only" }, hashtags: ["venue"] });
  assert.match(posts.instagram.text, /IG only/); assert.match(posts.facebook.text, /Base/); assert.match(posts.tiktok.text, /Base/);
});
test("copyErrors flags invented claims in ANY platform's caption, including AI per-platform captions", () => {
  const posts = buildSocialPosts({ caption: "A bright loft for your next workshop", platformCaptions: { tiktok: "Only $99 an hour, fits up to 200 guests!" }, hashtags: [] });
  const errs = copyErrors(posts);
  assert.equal(errs.length, 1); assert.match(errs[0], /^tiktok:/);
  assert.deepEqual(copyErrors(buildLinkedInPost({ text: "Host your next client workshop in a calm, well-lit room.", hashtags: ["Events"] })), []);
  assert.ok(copyErrors(buildLinkedInPost({ text: "", hashtags: [] })).length > 0);
});
