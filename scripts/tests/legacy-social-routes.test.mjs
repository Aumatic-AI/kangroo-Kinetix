// Proves the legacy manual-Social routes refuse automation posts BEFORE any
// Upload-Post / Inngest call, and still serve manual posts.
// Run: node --experimental-test-module-mocks --import ./scripts/tests/alias-register.mjs --test scripts/tests/legacy-social-routes.test.mjs
import test, { mock } from "node:test";
import assert from "node:assert/strict";

const state = { posts: [], updates: [], upload: [], inngest: [] };
function table(name) {
  const q = { _f: [] };
  q.select = () => q; q.in = () => q; q.eq = () => q; q.single = async () => ({ data: state.posts[0] ?? null });
  q.update = (patch) => { state.updates.push([name, patch]); return q; };
  q.then = (res) => res({ data: name === "social_posts" ? state.posts : null, error: null });
  return q;
}
mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => ({ from: table }) } });
mock.module("@/types/supabase", { namedExports: { Database: undefined } });
mock.module("@/config/env", { namedExports: { env: { UPLOAD_POST_PROFILE: "kangrooo" } } });
mock.module("@/services/inngest/client", { namedExports: { inngest: { send: async (e) => { state.inngest.push(e); } } } });
mock.module("@/services/upload-post", { namedExports: {
  UploadPostService: {
    publishVideo: async (p) => { state.upload.push(["video", p]); return { success: true, results: {} }; },
    publishPhotos: async (p) => { state.upload.push(["photos", p]); return { success: true, results: { instagram: { success: true } } }; },
    publishText: async (p) => { state.upload.push(["text", p]); return { success: true, results: { instagram: { success: true } } }; },
    cancelScheduledPost: async (id) => { state.upload.push(["cancel", id]); },
  }, UploadPostPlatform: undefined } });

const { POST: publish } = await import("../../src/app/api/social/posts/publish/route.ts");
const { POST: retry } = await import("../../src/app/api/social/posts/retry/route.ts");
const { POST: cancel } = await import("../../src/app/api/social/posts/cancel-schedule/route.ts");
const req = (body) => new Request("http://x/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const reset = (posts) => { state.posts = posts; state.updates = []; state.upload = []; state.inngest = []; };
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
  reset([MANUAL]);
  const res = await publish(req({ socialPostIds: ["m1"] }));
  assert.equal(res.status, 200);
  assert.equal(state.upload.length, 1, "manual publish reaches Upload-Post");
  assert.ok(state.updates.some(([, p]) => p.status === "published"));
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
