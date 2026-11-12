// Logo branding: the ffmpeg overlay command for the Seedance clip (checks the command text — no ffmpeg needed)
// and the sharp image stamp (runs sharp locally on synthetic images).
// Run: node --test scripts/tests/content-ffmpeg.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const sharp = (await import("sharp")).default;
const { brandVideoCommand } = await import("../../src/services/content-automation/ffmpeg-commands.ts");
const { brandImage, videoLogo, logoPlacement, toneFor, renderEndCard } = await import("../../src/services/content-automation/brand-logo.ts");

test("video branding: corner logo, dip to black, 1 s end card — one job, chains joined with ',' (the renderer blocks ';')", () => {
  const c = brandVideoCommand({ offset: 16, hasAudio: true, durationSeconds: 30.08, fps: 24 });
  assert.match(c, /^ffmpeg -y -i \{input0\} -i \{input1\} -loop 1 -framerate 24 -t 1 -i \{input2\} /); assert.match(c, /\{output\}$/);
  assert.doesNotMatch(c, /[;|&$]|https?:|movie=/);
  assert.match(c, /overlay=W-w-16:16/);                                         // top-right logo, before the fade so it fades too
  assert.match(c, /fade=t=out:st=29\.58:d=0\.5:color=black/);                    // picture dips to black over the last 0.5 s
  assert.match(c, /\[2:v\]setsar=1,format=yuv420p,fade=t=in:st=0:d=0\.4:color=black\[card\]/);   // logo fades in from black
  assert.match(c, /\[main\]\[card\]concat=n=2:v=1:a=0\[v\]/);
  assert.match(c, /\[0:a\]afade=t=out:st=29\.68:d=0\.4,apad=pad_dur=1\[a\]/);    // audio fades, silence under the card
  assert.match(c, /-map "\[a\]" -c:a aac/); assert.match(c, /\+faststart/);
  const silent = brandVideoCommand({ offset: 16, hasAudio: false, durationSeconds: 30, fps: 0 });
  assert.doesNotMatch(silent, /0:a|\[a\]/);                                     // a silent clip must not fail on a missing audio map
  assert.match(silent, /-framerate 24 /);                                       // unknown fps falls back to 24
});

test("end card: the video's exact size, black, with a white logo centred", async () => {
  const png = await renderEndCard(480, 854);
  const meta = await sharp(png).metadata();
  assert.equal(meta.width, 480); assert.equal(meta.height, 854);
  assert.equal(await meanAt(png, { left: 0, top: 0, width: 480, height: 300 }), 0);               // black above the logo
  assert.ok(await meanAt(png, { left: 140, top: 400, width: 200, height: 54 }) > 40);              // white logo in the middle
});

test("logo size and margin scale with the frame", () => {
  assert.deepEqual(logoPlacement(1024, "image"), { width: 205, height: 47, margin: 41 });
  assert.equal(logoPlacement(480, "video").width, 125);
  assert.equal(toneFor(200), "dark"); assert.equal(toneFor(60), "light");
});

const solid = (w, h, v) => sharp({ create: { width: w, height: h, channels: 3, background: { r: v, g: v, b: v } } }).jpeg().toBuffer();
const meanAt = async (buf, region) => (await sharp(await sharp(buf).extract(region).toBuffer()).stats()).channels[0].mean;

test("the tone is judged from the corner under the logo, not the whole image", async () => {
  // dark image with a light top-right corner → dark logo
  const img = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: { r: 20, g: 20, b: 20 } } })
    .composite([{ input: await solid(400, 200, 245), left: 680, top: 0 }]).jpeg().toBuffer();
  assert.equal((await brandImage(img)).logo.tone, "dark");
});

test("images: logo stamped top-right, dark on a light corner and white on a dark one; the rest untouched", async () => {
  for (const [bg, tone] of [[240, "dark"], [30, "light"]]) {
    const { buffer, logo } = await brandImage(await solid(1080, 1350, bg));
    assert.equal(logo.tone, tone);
    const meta = await sharp(buffer).metadata();
    assert.equal(meta.format, "jpeg"); assert.equal(meta.width, 1080); assert.equal(meta.height, 1350);
    assert.equal(logo.left + logo.width + logoPlacement(1080, "image").margin, 1080);   // flush to the right margin
    const mark = await meanAt(buffer, { left: logo.left, top: logo.top, width: logo.width, height: 40 });
    assert.ok(tone === "dark" ? mark < bg - 40 : mark > bg + 40, `logo visible on ${bg}: ${mark}`);
    const away = await meanAt(buffer, { left: 20, top: 600, width: 200, height: 200 });       // nowhere else is changed
    assert.ok(Math.abs(away - bg) < 3);
  }
});

test("video logo: white PNG with a shadow pad; the offset keeps the logo itself on the margin", async () => {
  const v = await videoLogo(480);
  const meta = await sharp(v.png).metadata();
  assert.equal(meta.format, "png"); assert.ok(meta.hasAlpha);
  const pad = (meta.width - v.width) / 2;
  assert.equal(v.offset + pad, logoPlacement(480, "video").margin);
});
