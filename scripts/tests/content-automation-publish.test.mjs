// Control-flow tests for the content-automation publishing worker.
// Run: node --test scripts/tests/
// The database and Upload-Post are faked; the SQL side is covered separately by
// the Postgres suite (claim / finish / reconcile functions).
import test from "node:test";
import assert from "node:assert/strict";
import {
  publishClaimedPost, runPublishBatch, reconcileUnknownPosts, classifyPublishError,
} from "../../src/services/content-automation/publish.ts";

const POST = { id: "post-1", platform: "instagram", publish_attempt_count: 1, upload_post_request_id: null, upload_post_job_id: null };
const PAYLOAD = (o = {}) => ({ platform: "instagram", format: "image", caption: "Hello", hashtags: ["venue", "#space"],
  media_type: "image", media_url: "https://cdn/x.png", connection_metadata: {}, ...o });

function harness({ block = [null, null], payload = PAYLOAD(), profile = { social_accounts: { instagram: { username: "u" } } },
  publish, status, finishThrows = false, unknownPosts = [] } = {}) {
  const calls = []; const upCalls = []; let blockN = 0;
  const db = {
    async rpc(name, args) {
      calls.push([name, args]);
      switch (name) {
        case "publish_block_reason": return { data: block[Math.min(blockN++, block.length - 1)], error: null };
        case "get_publish_payload": return { data: payload, error: null };
        case "finish_publish":
          if (finishThrows) return { data: null, error: { message: "boom" } };
          return { data: ({ published: "published", failed: args.p_retryable ? "scheduled" : "failed", unknown: "publishing", blocked: "held" })[args.p_outcome], error: null };
        case "record_publish_response": return { data: true, error: null };
        case "recover_stale_publishing": return { data: 0, error: null };
        case "claim_publish_jobs": return { data: [POST], error: null };
        case "unknown_publish_posts": return { data: unknownPosts, error: null };
        case "resolve_unknown_publish": return { data: args.p_outcome, error: null };
        default: throw new Error("unexpected rpc " + name);
      }
    },
  };
  const uploadPost = {
    async getProfile() { return profile; },
    async publishPhotos(p) { upCalls.push(["photos", p]); return publish(); },
    async publishVideo(p) { upCalls.push(["video", p]); return publish(); },
    async publishText(p) { upCalls.push(["text", p]); return publish(); },
    async getUploadStatus(p) { upCalls.push(["status", p]); return typeof status === "function" ? status() : status; },
  };
  const deps = { db, uploadPost, profile: "kangrooo", worker: "w1", sleep: async () => {}, pollAttempts: 2 };
  const finishes = () => calls.filter(([n]) => n === "finish_publish").map(([, a]) => a);
  const names = () => calls.map(([n]) => n);
  return { deps, calls, upCalls, finishes, names };
}
const httpErr = (status, msg = "x") => Object.assign(new Error(msg), { status });

test("happy path: publishes once, immediately (no scheduledDate), ids recorded before finish", async () => {
  const h = harness({ publish: async () => ({ success: true, request_id: "r1", results: { instagram: { success: true, post_id: "ig-9" } } }) });
  const r = await publishClaimedPost(h.deps, POST);
  assert.equal(r.outcome, "published");
  assert.equal(h.upCalls.length, 1);
  assert.equal(h.upCalls[0][0], "photos");
  assert.equal("scheduledDate" in h.upCalls[0][1], false, "must not hand scheduling to Upload-Post");
  assert.deepEqual(h.upCalls[0][1].platforms, ["instagram"]);
  assert.equal(h.upCalls[0][1].title, "Hello\n\n#venue #space");
  const n = h.names();
  assert.ok(n.indexOf("record_publish_response") < n.indexOf("finish_publish"), "ids persisted before interpretation");
  assert.equal(n.filter((x) => x === "publish_block_reason").length, 2, "rechecked at start and right before the call");
  assert.equal(h.finishes()[0].p_platform_post_id, "ig-9");
});

test("blocked by the early recheck: Upload-Post is never called", async () => {
  const h = harness({ block: ["mode_not_live"], publish: async () => assert.fail("must not publish") });
  const r = await publishClaimedPost(h.deps, POST);
  assert.equal(r.outcome, "blocked"); assert.equal(r.detail, "mode_not_live");
  assert.equal(h.upCalls.length, 0);
  assert.equal(h.finishes()[0].p_outcome, "blocked");
  assert.equal(h.finishes()[0].p_block_reason, "mode_not_live");
});

test("flipped to Testing between claim and call: the second recheck stops the publish", async () => {
  const h = harness({ block: [null, "mode_not_live"], publish: async () => assert.fail("must not publish") });
  const r = await publishClaimedPost(h.deps, POST);
  assert.equal(r.outcome, "blocked"); assert.equal(h.upCalls.filter(([k]) => k !== "status").length, 0);
});

test("connection not live on Upload-Post: blocked, nothing sent", async () => {
  const h = harness({ profile: { social_accounts: { instagram: null } }, publish: async () => assert.fail("must not publish") });
  const r = await publishClaimedPost(h.deps, POST);
  assert.equal(r.outcome, "blocked"); assert.equal(h.finishes()[0].p_block_reason, "connection_unhealthy");
});

test("connection check itself fails: safe retryable failure, nothing sent", async () => {
  const h = harness({ publish: async () => assert.fail("must not publish") });
  h.deps.uploadPost.getProfile = async () => { throw new Error("dns"); };
  const r = await publishClaimedPost(h.deps, POST);
  assert.equal(r.outcome, "retry_scheduled"); assert.equal(h.finishes()[0].p_retryable, true);
});

test("4xx = definite rejection (not retryable); 429 = retryable", async () => {
  for (const [status, retryable] of [[400, false], [403, false], [429, true]]) {
    const h = harness({ publish: async () => { throw httpErr(status); } });
    const r = await publishClaimedPost(h.deps, POST);
    assert.equal(r.outcome, retryable ? "retry_scheduled" : "failed", `status ${status}`);
    assert.equal(h.finishes()[0].p_retryable, retryable);
    assert.equal(h.upCalls.length, 1, "exactly one external call");
  }
});

test("network drop / timeout / 5xx = UNKNOWN: recorded as unknown, never retried here", async () => {
  for (const err of [new TypeError("fetch failed"), httpErr(500), httpErr(502), httpErr(408), new Error("timeout")]) {
    const h = harness({ publish: async () => { throw err; } });
    const r = await publishClaimedPost(h.deps, POST);
    assert.equal(r.outcome, "unknown", String(err.message));
    assert.equal(h.finishes().length, 1);
    assert.equal(h.finishes()[0].p_outcome, "unknown");
    assert.equal(h.finishes()[0].p_retryable ?? false, false);
    assert.equal(h.upCalls.length, 1, "no blind retry of the external call");
  }
});

test("200 with success:false body is a definite failure, not unknown", async () => {
  const h = harness({ publish: async () => { throw httpErr(200, "bad media"); } });
  assert.equal((await publishClaimedPost(h.deps, POST)).outcome, "failed");
});

test("accepted for background processing: polls the saved id and publishes when complete", async () => {
  let n = 0;
  const h = harness({ publish: async () => ({ success: true, request_id: "req-7" }),
    status: () => (++n < 2 ? { status: "processing" } : { status: "completed", results: [{ platform: "instagram", success: true }] }) });
  const r = await publishClaimedPost(h.deps, POST);
  assert.equal(r.outcome, "published");
  assert.deepEqual(h.upCalls.filter(([k]) => k === "status")[0][1], { requestId: "req-7" });
  assert.equal(h.upCalls.filter(([k]) => k === "photos").length, 1, "never re-publishes while polling");
});

test("still processing after polls: left publishing (no finish) for lease-expiry reconciliation", async () => {
  const h = harness({ publish: async () => ({ success: true, job_id: "job-3" }), status: { status: "processing" } });
  const r = await publishClaimedPost(h.deps, POST);
  assert.equal(r.outcome, "pending"); assert.equal(h.finishes().length, 0);
});

test("poll reports failure: failed, not retryable", async () => {
  const h = harness({ publish: async () => ({ success: true, request_id: "r" }), status: { status: "failed", results: [{ platform: "instagram", message: "rejected by IG" }] } });
  const r = await publishClaimedPost(h.deps, POST);
  assert.equal(r.outcome, "failed"); assert.equal(h.finishes()[0].p_retryable, false);
});

test("response with neither result nor tracking id: unknown", async () => {
  const h = harness({ publish: async () => ({ success: true }) });
  assert.equal((await publishClaimedPost(h.deps, POST)).outcome, "unknown");
});

test("LinkedIn video payload is refused before any call", async () => {
  const h = harness({ payload: PAYLOAD({ platform: "linkedin", media_type: "video", format: "video" }), publish: async () => assert.fail("no") });
  const r = await publishClaimedPost(h.deps, { ...POST, platform: "linkedin" });
  assert.equal(r.outcome, "failed"); assert.equal(h.upCalls.length, 0);
});

test("missing media is a non-retryable failure before any call", async () => {
  const h = harness({ payload: PAYLOAD({ media_url: null, media_type: null }), publish: async () => assert.fail("no") });
  assert.equal((await publishClaimedPost(h.deps, POST)).outcome, "failed"); assert.equal(h.upCalls.length, 0);
});

test("runPublishBatch: an error after the external call leaves the post untouched (no second finish, no retry)", async () => {
  const h = harness({ finishThrows: true, publish: async () => ({ success: true, request_id: "r", results: { instagram: { success: true } } }) });
  const out = await runPublishBatch(h.deps, { limit: 5 });
  assert.equal(out[0].outcome, "error");
  assert.equal(h.upCalls.filter(([k]) => k === "photos").length, 1);
  assert.equal(h.finishes().length, 1, "no compensating finish; lease expiry → unknown → reconcile");
  assert.ok(h.names().indexOf("recover_stale_publishing") < h.names().indexOf("claim_publish_jobs"));
});

test("reconcile: resolves by saved id, never guesses, never retries", async () => {
  const mk = (id, extra) => ({ id, upload_post_request_id: "rq-" + id, upload_post_job_id: null, ...extra });
  const posts = [mk("a"), mk("b"), mk("c"), mk("d")];
  const results = { a: { status: "completed", results: [{ platform: "x", success: true }] }, b: { status: "failed", results: [{ platform: "x", message: "no" }] },
    c: { status: "processing" }, d: "throw" };
  const h = harness({ unknownPosts: posts, publish: async () => assert.fail("reconcile must never publish") });
  h.deps.uploadPost.getUploadStatus = async ({ requestId }) => { const r = results[requestId.slice(3)]; if (r === "throw") throw new Error("net"); return r; };
  const out = await reconcileUnknownPosts(h.deps);
  assert.deepEqual(out, { resolved: 2, stillUnknown: 2 });
  const res = h.calls.filter(([n]) => n === "resolve_unknown_publish").map(([, a]) => [a.p_post, a.p_outcome]);
  assert.deepEqual(res, [["a", "published"], ["b", "failed"]]);
  assert.equal(h.upCalls.filter(([k]) => k !== "status").length, 0);
});

test("classifyPublishError table", () => {
  const k = (e) => classifyPublishError(e);
  assert.equal(k(httpErr(400)).kind, "rejected"); assert.equal(k(httpErr(429)).retryable, true);
  assert.equal(k(httpErr(404)).retryable, false);
  for (const e of [httpErr(408), httpErr(500), httpErr(503), new TypeError("fetch failed"), "weird", null]) assert.equal(k(e).kind, "unknown");
});
