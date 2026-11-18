// Proves the legacy manual-Social routes refuse automation posts BEFORE any
// Upload-Post / Inngest call, still serve manual posts, and never send a manual
// post twice (claim before publish; cancel only reverts once Upload-Post confirms).
// Run: node --experimental-test-module-mocks --import ./scripts/tests/alias-register.mjs --test scripts/tests/legacy-social-routes.test.mjs
import test, { mock } from "node:test";
import assert from "node:assert/strict";

const state = { posts: [], updates: [], upload: [], inngest: [], claimLost: false, textImpl: null, cancelImpl: null, sendImpl: null };
function table(name) {
  const q = { _f: [] };
  q.select = () => q; q.in = () => q; q.eq = () => q; q.is = () => q; q.single = async () => ({ data: state.posts[0] ?? null });
  q.update = (patch) => { state.updates.push([name, patch]); q._patch = patch; return q; };
  // The publish route's claim is an update to 'publishing' that returns the rows it won.
  q.then = (res) => res({ data: name !== "social_posts" ? null : q._patch?.status === "publishing" && state.claimLost ? [] : state.posts, error: null });
  return q;
}
mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => ({ from: table }) } });
mock.module("@/types/supabase", { namedExports: { Database: undefined } });
mock.module("@/config/env", { namedExports: { env: { UPLOAD_POST_PROFILE: "kangrooo" } } });
mock.module("@/services/inngest/client", { namedExports: { inngest: { send: async (e) => { if (state.sendImpl) return state.sendImpl(e); state.inngest.push(e); } } } });
mock.module("@/services/upload-post", { namedExports: {
  UploadPostService: {
    publishVideo: async (p) => { state.upload.push(["video", p]); return { success: true, results: {} }; },
    publishPhotos: async (p) => { state.upload.push(["photos", p]); return { success: true, results: { instagram: { success: true } } }; },
    publishText: async (p) => { state.upload.push(["text", p]); return state.textImpl ? state.textImpl(p) : { success: true, results: { instagram: { success: true } } }; },
    cancelScheduledPost: async (id) => { state.upload.push(["cancel", id]); if (state.cancelImpl) return state.cancelImpl(id); },
  }, UploadPostPlatform: undefined } });

const { POST: publish } = await import("../../src/app/api/social/posts/publish/route.ts");
const { POST: retry } = await import("../../src/app/api/social/posts/retry/route.ts");
const { POST: cancel } = await import("../../src/app/api/social/posts/cancel-schedule/route.ts");
const req = (body) => new Request("http://x/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const reset = (posts) => Object.assign(state, { posts, updates: [], upload: [], inngest: [], claimLost: false, textImpl: null, cancelImpl: null, sendImpl: null });
const AUTO = { id: "a1", property_content_id: "pc-1", environment: "live", status: "failed", caption: "c", platform_connections: { platform: "instagram", metadata: {} } };
const MANUAL = { id: "m1", property_content_id: null, environment: null, status: "failed", format: "text", caption: "hi", title: null, media_asset_id: null,
  connection_id: "c1", business_id: "b1", generation_inputs: {}, platform_connections: { platform: "instagram", metadata: {} }, upload_post_job_id: null };

test("publish route: automation post is refused with 409 before ANY Upload-Post call or DB write", async () => {
  reset([AUTO]);
  const res = await publish(req({ socialPostIds: ["a1"] }));
  assert.equal(res.status, 409);
  assert.equal(state.upload.length, 0, "Upload-Post must not be called");
  assert.equal(state.updates.length, 0, "no status write");
});
test("publish route: one automation id in a mixed batch refuses the WHOLE batch", async () => {
  reset([MANUAL, AUTO]);
  const res = await publish(req({ socialPostIds: ["m1", "a1"] }));
  assert.equal(res.status, 409); assert.equal(state.upload.length, 0);
});
test("publish route: a manual post still publishes (legit behaviour preserved)", async () => {
  reset([{ ...MANUAL, status: "draft" }]);
  const res = await publish(req({ socialPostIds: ["m1"] }));
  assert.equal(res.status, 200);
  assert.equal(state.upload.length, 1, "manual publish reaches Upload-Post");
  assert.ok(state.updates.some(([, p]) => p.status === "published"));
  assert.equal(state.updates[0][1].status, "publishing", "claimed before the Upload-Post call");
});
test("retry route: automation post refused with 409, no status reset, no event", async () => {
  reset([AUTO]);
  const res = await retry(req({ socialPostIds: ["a1"] }));
  assert.equal(res.status, 409);
  assert.equal(state.updates.length, 0, "must NOT reset it to draft");
  assert.equal(state.inngest.length, 0);
});
test("retry route: a failed manual text post still resets to draft", async () => {
  reset([MANUAL]);
  const res = await retry(req({ socialPostIds: ["m1"] }));
  assert.equal(res.status, 200);
  assert.ok(state.updates.some(([, p]) => p.status === "draft"));
});
test("cancel-schedule route: automation post refused, Upload-Post never contacted", async () => {
  reset([{ ...AUTO, status: "scheduled", upload_post_job_id: "j1" }]);
  const res = await cancel(req({ socialPostIds: ["a1"] }));
  assert.equal(res.status, 409); assert.equal(state.upload.length, 0); assert.equal(state.updates.length, 0);
});

const DRAFT = { ...MANUAL, status: "draft" };

test("publish route: a post someone else already claimed (double click, 2nd tab) is NOT sent again", async () => {
  reset([DRAFT]); state.claimLost = true;
  const res = await publish(req({ socialPostIds: ["m1"] }));
  assert.equal(res.status, 200);
  assert.equal(state.upload.length, 0, "Upload-Post must not be called");
  const body = await res.json();
  assert.equal(body.results[0].skipped, true);
});

test("publish route: a scheduled time in the past is refused before anything is sent", async () => {
  reset([DRAFT]);
  const res = await publish(req({ socialPostIds: ["m1"], scheduledDate: new Date(Date.now() - 60_000).toISOString() }));
  assert.equal(res.status, 400);
  assert.equal(state.upload.length, 0);
  assert.equal(state.updates.length, 0);
});

test("publish route: no response from Upload-Post → failed, flagged 'may have posted'", async () => {
  reset([DRAFT]); state.textImpl = async () => { throw new TypeError("fetch failed"); };
  const res = await publish(req({ socialPostIds: ["m1"] }));
  assert.equal(res.status, 200);
  const failed = state.updates.find(([, p]) => p.status === "failed");
  assert.ok(failed, "recorded as failed");
  assert.match(failed[1].error_message, /may have posted/);
});

test("publish route: accepted by Upload-Post but the follow-up fails → never marked failed (Retry would resend)", async () => {
  reset([DRAFT]);
  state.textImpl = async () => ({ success: true, job_id: "j9" });
  state.sendImpl = async () => { throw new Error("inngest down"); };
  const res = await publish(req({ socialPostIds: ["m1"], scheduledDate: new Date(Date.now() + 3_600_000).toISOString() }));
  assert.equal(res.status, 200);
  assert.equal(state.upload.length, 1);
  assert.ok(!state.updates.some(([, p]) => p.status === "failed"), "must not become failed");
  assert.ok(state.updates.some(([, p]) => p.status === "scheduled"));
});

test("cancel-schedule: Upload-Post doesn't confirm → 502 and the post stays scheduled", async () => {
  reset([{ ...MANUAL, status: "scheduled", upload_post_job_id: "j1" }]);
  state.cancelImpl = async () => { throw new Error("upstream 500"); };
  const res = await cancel(req({ socialPostIds: ["m1"] }));
  assert.equal(res.status, 502);
  assert.equal(state.updates.length, 0, "not reverted to draft");
});

test("cancel-schedule: no recorded job id → 502, not silently turned into a draft", async () => {
  reset([{ ...MANUAL, status: "scheduled", upload_post_job_id: null }]);
  const res = await cancel(req({ socialPostIds: ["m1"] }));
  assert.equal(res.status, 502);
  assert.equal(state.upload.length, 0);
  assert.equal(state.updates.length, 0);
});

test("cancel-schedule: confirmed cancel reverts to draft", async () => {
  reset([{ ...MANUAL, status: "scheduled", upload_post_job_id: "j1" }]);
  const res = await cancel(req({ socialPostIds: ["m1"] }));
  assert.equal(res.status, 200);
  assert.deepEqual(state.upload, [["cancel", "j1"]]);
  assert.ok(state.updates.some(([, p]) => p.status === "draft"));
});
