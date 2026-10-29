import { inngest } from "../client";
import { aiOrchestrator } from "../../ai/orchestrator";
import { createClient } from "@supabase/supabase-js";
import { getVisualPromptsPrompt, MOOD_CINEMATOGRAPHY, MODES_WITH_PROTAGONIST } from "../../../prompts/meta-ads/video";
import { generateVideoScript, VideoScriptResult } from "../../ai/video-script";
import { getAudioDurationSeconds } from "../../ai/audio-duration";
import { FFmpegService } from "../../ffmpeg";
import { submitPerSceneStitchJob, downloadAndStoreVideo } from "../../ffmpeg/stitch-scenes";
import { resolveVideoReferenceUrl } from "../../ai/video-reference";
import { elevenLabsLanguageCode } from "../../ai/providers/elevenlabs";
import { env } from "@/config";

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY!
);

// Kie's Seedance video model's own documented duration range — every
// per-scene clip request is clamped into this range regardless of how long
// that scene's real narration measured.
const MIN_SCENE_SECONDS = 4;
const MAX_SCENE_SECONDS = 12;
// Used only when there's no narration to size a scene against (audioStyle
// isn't "Voiceover") — matches the old fixed-clip-length default.
const DEFAULT_SCENE_SECONDS = 4;

// A live-action Seedance clip with real human motion never compresses down
// to almost nothing — this floor exists purely to catch the suspiciously
// tiny file size of a blank/near-black clip (see the content-moderation
// note at the video poll step below), not to judge legitimate quality.
const MIN_VIDEO_BYTES_PER_SECOND = 15000;

async function getRemoteContentLength(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    const len = res.headers.get("content-length");
    return len ? parseInt(len, 10) : null;
  } catch {
    return null;
  }
}

export const generateVideoAd = inngest.createFunction(
  {
    id: "generate-video-ad",
    triggers: [{ event: "meta-ads/generate-video" }]
  },
  async ({ event, step }) => {
    const { ideaPrompt, duration, audioStyle, character, voiceId, videoStyle, language, service, creativeId, businessId, videoMode, useReferencePhoto } = event.data;
    const isPosterMode = videoMode === "animated_poster";
    // Every source image and every video clip for this generation must share
    // this one ratio (source images are what image-to-video is conditioned
    // on) — defaults to the original portrait shape for any caller that
    // doesn't send one yet.
    const aspectRatio: "16:9" | "9:16" = event.data.aspectRatio === "16:9" ? "16:9" : "9:16";

    if (!creativeId) throw new Error("No creativeId provided");

    try {
      // 1. Fetch business context
      const intelligence = await step.run("fetch-intelligence", async () => {
        const { data: businessData } = await supabase
          .from("businesses")
          .select("*")
          .eq("id", businessId)
          .single();

        return { business: businessData || {} };
      });

      // 2. Script — reuse whatever the user already reviewed/approved (or
      // edited) in the Create Ad modal's script-review step, if one was
      // sent; only generate a fresh one here when none was supplied (e.g.
      // a retry that skips the review step). Same prompt, same call, same
      // trimming either way — see generateVideoScript's own doc comment.
      const scriptJson: VideoScriptResult = event.data.script
        ? event.data.script
        : await step.run("generate-script", () =>
            generateVideoScript(intelligence, { ideaPrompt, duration, audioStyle, videoStyle, character, service, language })
          );

      // 3. Generate Visual Prompts via LLM — resolved ahead of this step (not
      // just before image generation below) so the prompt itself can be told
      // whether a reference photo will be conditioning every scene's face.
      // The reference face-lock is a plain user toggle (default off, see
      // CreateAdModal), not something derived from the ad's mode — even a
      // TRANSFORMATION ad might not want the configured photo used, and an
      // otherwise-non-protagonist ad could still want it if the idea calls
      // for showing that real person. Poster mode never applies it either
      // way (a graphic composition doesn't need a locked face).
      const referenceUrl = (isPosterMode || !useReferencePhoto) ? undefined : resolveVideoReferenceUrl(intelligence.business, character);
      const logoUrl: string | undefined = intelligence.business.logo_url || undefined;
      const brandColor: string | undefined = intelligence.business.business_colors?.primary || undefined;
      // Live-action scenes with a protagonist need SOME cross-scene face/
      // body lock or the person's appearance drifts scene to scene (older,
      // younger, different skin tone) purely by chance — each scene's image
      // generation call is otherwise independent, with no memory of what a
      // previous call actually rendered. If no real reference photo is
      // configured (the default), an auto-anchor fills that role instead:
      // scene 1 is generated alone, then reused as the identity lock for
      // every other scene — see the anchor-generation step below. Computed
      // here, before visual prompts, so that prompt can be told a face-lock
      // is coming even though the actual anchor image doesn't exist yet.
      const hasProtagonist = MODES_WITH_PROTAGONIST.has(scriptJson.ad_mode);
      const needsIdentityAnchor = !isPosterMode && hasProtagonist && !referenceUrl;
      const visualPromptsJson = await step.run("generate-visual-prompts", async () => {
        const vpPrompt = getVisualPromptsPrompt(
          scriptJson.script,
          { character, videoStyle, duration, service, hasReferenceImage: !!referenceUrl || needsIdentityAnchor, adMode: scriptJson.ad_mode, videoMode, hasLogo: !!logoUrl, brandColor },
          intelligence.business
        );
        const response = await aiOrchestrator.executeTask('text', vpPrompt, 'openai');
        const jsonStr = (response as string).replace(/```json\n?|\n?```/g, "").trim();
        return JSON.parse(jsonStr);
      });

      // 4. Audio generation — one narration clip PER SCENE (not one
      // continuous track for the whole script), each measured for its
      // real spoken length. That real, measured duration (not a
      // words-per-second estimate) is what step 7 requests for that
      // scene's video clip, so every scene's audio and video are the same
      // length by construction — no separate track to drift long/short
      // against a uniformly fixed clip length. Generated one scene at a
      // time, not via Promise.all — this ElevenLabs account's plan caps
      // concurrent requests at 6, and firing every scene at once was
      // already enough on its own to blow past that (a 7-scene video =
      // 7 concurrent requests), on top of whatever else might be running
      // at the same time. Sequential costs a few extra seconds total, not
      // meaningful next to the minutes the rest of this pipeline takes.
      const sceneAudio: { url: string | null; durationSeconds: number }[] = await step.run("generate-scene-audio", async () => {
        if (audioStyle !== "Voiceover" || !voiceId) {
          return scriptJson.script.map(() => ({ url: null, durationSeconds: DEFAULT_SCENE_SECONDS }));
        }
        const languageCode = elevenLabsLanguageCode(language);
        const results: { url: string | null; durationSeconds: number }[] = [];
        for (let i = 0; i < scriptJson.script.length; i++) {
          const line = scriptJson.script[i];
          const audioBuffer = await aiOrchestrator.generateSpeech(line, voiceId, languageCode);
          const rawDuration = await getAudioDurationSeconds(audioBuffer);
          const durationSeconds = Math.min(MAX_SCENE_SECONDS, Math.max(MIN_SCENE_SECONDS, Math.round(rawDuration)));

          const fileName = `${businessId}/meta-ads/audio/${creativeId}_scene${i}_${Date.now()}.mp3`;
          const { error } = await supabase.storage.from("business_media").upload(fileName, audioBuffer, { contentType: "audio/mpeg" });
          if (error) throw new Error(`Scene ${i + 1} audio upload failed: ${error.message}`);

          const { data } = supabase.storage.from("business_media").getPublicUrl(fileName);
          results.push({ url: data.publicUrl, durationSeconds });
        }
        return results;
      });

      // 5. Trigger Images. Three anchor strategies:
      // - POSTER MODE: one "design" anchor (scene 1), reused for every
      //   other scene so the whole video shares one consistent graphic
      //   design system.
      // - TRANSFORMATION mode, live-action, no real reference photo
      //   configured: TWO anchors — a "before" anchor (scene 1, Phase 1)
      //   and an "after" anchor (the last scene, Phase 3), generated one
      //   after another so both share the same person's face/body/wardrobe
      //   while genuinely differing in the ONE diagnosed condition
      //   attribute. A single shared anchor used to cause the model to
      //   lock onto whichever state that one anchor happened to show
      //   (almost always "before", since scene 1 sets it) for every scene,
      //   including the ones meant to show the resolved "after" state —
      //   text alone telling the model to "override the reference for this
      //   one attribute" wasn't reliable enough against a strong visual
      //   reference, so the fix is architectural: no single anchor is ever
      //   asked to represent two visually-contradictory states.
      // - Any other protagonist mode, live-action, no real reference
      //   photo: ONE identity anchor (scene 1) — there's no before/after
      //   tension to resolve, so the simpler single-anchor approach is enough.
      // Poster mode treats a failed anchor as fatal; both live-action
      // anchor strategies are best-effort — a failure falls back to
      // independent per-scene generation instead of failing the video.
      const isTransformationMode = scriptJson.ad_mode === "TRANSFORMATION";
      // The anchor image is what every other scene's face/identity gets
      // locked to — if the anchor itself renders the wrong gender, every
      // scene inherits it regardless of what each scene's own text says (a
      // reference image dominates a contradicting text instruction, the same
      // reason the before/after hair fix had to be architectural rather than
      // just stronger wording). Appended in code, not left to the
      // LLM-authored prompt alone, so it's never diluted by everything else
      // in that prompt.
      const anchorGenderClause = character === "female"
        ? " The protagonist shown must be unambiguously and clearly a woman — feminine facial features, feminine build and styling. Never depict a man here."
        : character === "male"
        ? " The protagonist shown must be unambiguously and clearly a man — masculine facial features, masculine build and styling. Never depict a woman here."
        : "";
      const totalScenes = visualPromptsJson.visual_prompts.length;
      const needsTwoAnchors = needsIdentityAnchor && isTransformationMode && totalScenes >= 3;
      const lastSceneIndex = totalScenes - 1;
      const phase3StartIndex = Math.floor((2 * totalScenes) / 3);
      const MAX_ANCHOR_ATTEMPTS = 12;

      let anchorUrl: string | undefined;
      let beforeAnchorUrl: string | undefined;
      let afterAnchorUrl: string | undefined;

      if ((isPosterMode || (needsIdentityAnchor && !needsTwoAnchors)) && totalScenes > 0) {
        const anchorMode = isPosterMode ? "reference" : "identity";
        const anchorJobId = await step.run("trigger-scene-anchor-image", async () => {
          // The logo is only ever attached to the one scene the model marks
          // shows_business_location — never to the identity anchor, which is
          // a face-lock reference reused by every other scene and must never
          // itself carry (and thus potentially bleed) the logo into them.
          // Poster mode's "anchor" is a design-template reference, not a
          // protagonist face-lock, so it keeps its existing logo behavior.
          const referenceImages = isPosterMode ? [referenceUrl, logoUrl].filter(Boolean) as string[] : [referenceUrl].filter(Boolean) as string[];
          const anchorPrompt = isPosterMode ? visualPromptsJson.visual_prompts[0].prompt : `${visualPromptsJson.visual_prompts[0].prompt}${anchorGenderClause}`;
          return aiOrchestrator.createImageTask(anchorPrompt, aspectRatio, referenceImages, anchorMode);
        });

        let anchorAttempts = 0;
        while (!anchorUrl && anchorAttempts < MAX_ANCHOR_ATTEMPTS) {
          await step.sleep(`wait-scene-anchor-${anchorAttempts}`, anchorAttempts === 0 ? "20s" : "15s");
          const status = await step.run(`check-scene-anchor-status-${anchorAttempts}`, async () => aiOrchestrator.checkTaskStatus(anchorJobId));
          if (status.state === "success") {
            try {
              const r = JSON.parse(status.resultJson);
              anchorUrl = r.resultUrls?.[0] || r.urls?.[0] || undefined;
            } catch { /* malformed result — treated as still-pending below */ }
          } else if (status.state === "fail") {
            if (isPosterMode) throw new Error(`Kie poster anchor image failed: ${status.failMsg || status.failCode || "no reason given"}`);
            console.error(`Identity anchor image failed, continuing without it: ${status.failMsg || status.failCode || "no reason given"}`);
            break;
          }
          anchorAttempts++;
        }
        if (isPosterMode && !anchorUrl) throw new Error("Poster anchor image generation timed out");
      } else if (needsTwoAnchors) {
        const beforeJobId = await step.run("trigger-before-anchor-image", async () => {
          // Never the logo here either — same reasoning as the single-anchor
          // branch above, this image locks the protagonist's face for every
          // other scene.
          const referenceImages = [referenceUrl].filter(Boolean) as string[];
          return aiOrchestrator.createImageTask(`${visualPromptsJson.visual_prompts[0].prompt}${anchorGenderClause}`, aspectRatio, referenceImages, "identity");
        });

        let beforeAttempts = 0;
        while (!beforeAnchorUrl && beforeAttempts < MAX_ANCHOR_ATTEMPTS) {
          await step.sleep(`wait-before-anchor-${beforeAttempts}`, beforeAttempts === 0 ? "20s" : "15s");
          const status = await step.run(`check-before-anchor-status-${beforeAttempts}`, async () => aiOrchestrator.checkTaskStatus(beforeJobId));
          if (status.state === "success") {
            try {
              const r = JSON.parse(status.resultJson);
              beforeAnchorUrl = r.resultUrls?.[0] || r.urls?.[0] || undefined;
            } catch { /* malformed result — treated as still-pending below */ }
          } else if (status.state === "fail") {
            console.error(`Before-anchor image failed, continuing without either anchor: ${status.failMsg || status.failCode || "no reason given"}`);
            break;
          }
          beforeAttempts++;
        }

        if (beforeAnchorUrl) {
          // A dedicated, single-purpose edit — "same person, but this one
          // attribute is now resolved" — rather than asking every Phase 3
          // scene individually to override a strong visual reference.
          const afterPrompt = `${visualPromptsJson.visual_prompts[lastSceneIndex].prompt} This must be the exact same person as the attached reference image — identical face, bone structure, skin tone, and body type — but with the specific condition now fully resolved, exactly as this scene's own description states. Every other feature of their identity stays exactly as the reference shows; only that one resolved attribute differs.${anchorGenderClause}`;
          const afterJobId = await step.run("trigger-after-anchor-image", async () => {
            const referenceImages = [beforeAnchorUrl].filter(Boolean) as string[];
            return aiOrchestrator.createImageTask(afterPrompt, aspectRatio, referenceImages, "identity");
          });

          let afterAttempts = 0;
          while (!afterAnchorUrl && afterAttempts < MAX_ANCHOR_ATTEMPTS) {
            await step.sleep(`wait-after-anchor-${afterAttempts}`, afterAttempts === 0 ? "20s" : "15s");
            const status = await step.run(`check-after-anchor-status-${afterAttempts}`, async () => aiOrchestrator.checkTaskStatus(afterJobId));
            if (status.state === "success") {
              try {
                const r = JSON.parse(status.resultJson);
                afterAnchorUrl = r.resultUrls?.[0] || r.urls?.[0] || undefined;
              } catch { /* malformed result — treated as still-pending below */ }
            } else if (status.state === "fail") {
              console.error(`After-anchor image failed, falling back to the before-anchor for every scene: ${status.failMsg || status.failCode || "no reason given"}`);
              break;
            }
            afterAttempts++;
          }
        }
      }

      const imageJobIds = await step.run("trigger-images", async () => {
        const ids = [];
        for (let i = 0; i < visualPromptsJson.visual_prompts.length; i++) {
          const vp = visualPromptsJson.visual_prompts[i];

          if (needsTwoAnchors) {
            if (i === 0 && beforeAnchorUrl) {
              ids.push({ id: "", url: beforeAnchorUrl as string, scene: vp.scene, imagePrompt: vp.prompt, videoScenario: vp.video_scenario, fellBack: false, state: "success" as string | null });
              continue;
            }
            if (i === lastSceneIndex && afterAnchorUrl) {
              ids.push({ id: "", url: afterAnchorUrl as string, scene: vp.scene, imagePrompt: vp.prompt, videoScenario: vp.video_scenario, fellBack: false, state: "success" as string | null });
              continue;
            }
            const isPhase3 = i >= phase3StartIndex;
            const chosenAnchor = isPhase3 ? (afterAnchorUrl || beforeAnchorUrl) : beforeAnchorUrl;
            // Only the one scene the model itself marked as the business's
            // real location ever gets the logo reference — every other scene
            // has no logo image available to it at all, so it can't copy or
            // invent one.
            const referenceImages = [chosenAnchor, vp.shows_business_location ? logoUrl : undefined].filter(Boolean) as string[];
            const jobId = await aiOrchestrator.createImageTask(vp.prompt, aspectRatio, referenceImages, "identity");
            ids.push({ id: jobId, url: null as string | null, scene: vp.scene, imagePrompt: vp.prompt, videoScenario: vp.video_scenario, fellBack: false, state: null as string | null });
            continue;
          }

          if (anchorUrl && i === 0) {
            // Already generated above as the anchor — reuse it, no new job.
            ids.push({ id: "", url: anchorUrl as string, scene: vp.scene, imagePrompt: vp.prompt, videoScenario: vp.video_scenario, fellBack: false, state: "success" as string | null });
            continue;
          }
          const scenePrompt = isPosterMode
            ? `${vp.prompt} Match the exact background color, typography style, and overall design treatment of the attached reference image (scene 1 of this same ad) precisely — same color palette, same font style, same layout approach; only the on-scene text quoted above (and any specific photo/element this scene calls for) differs from it.`
            : vp.prompt;
          const referenceImages = isPosterMode
            ? ([anchorUrl, logoUrl].filter(Boolean) as string[])
            : ([referenceUrl || anchorUrl, vp.shows_business_location ? logoUrl : undefined].filter(Boolean) as string[]);
          const jobId = await aiOrchestrator.createImageTask(scenePrompt, aspectRatio, referenceImages, isPosterMode ? "reference" : "identity");
          ids.push({ id: jobId, url: null as string | null, scene: vp.scene, imagePrompt: vp.prompt, videoScenario: vp.video_scenario, fellBack: false, state: null as string | null });
        }
        return ids;
      });

      // 6. Poll for all images completion. Up to 8 scene images generate in
      // parallel on Kie's side, so completion time varies per-scene — give
      // slower/queued scenes enough room (~4.5 min total) rather than a
      // tight budget tuned for a single image. Kie's real terminal-failure
      // state is "fail" (its docs list waiting/queuing/generating/success/
      // fail) — an earlier version of this code checked for "failed"/"error",
      // which never matches, so a scene Kie had already rejected (e.g. a
      // content-safety hold on the reference-image + prompt combo, plausible
      // for sensitive scenes) looked identical to one still queued
      // and got polled all the way to the timeout below instead of being
      // caught immediately. Once a real "fail" is seen, retrying the exact
      // same reference-image-conditioned request would likely fail the same
      // way, so fall back once to plain text-to-image for just that scene.
      let imagesDone = false;
      let imgAttempts = 0;
      const MAX_IMAGE_ATTEMPTS = 12;
      while (!imagesDone && imgAttempts < MAX_IMAGE_ATTEMPTS) {
        await step.sleep(`wait-image-${imgAttempts}`, imgAttempts === 0 ? "30s" : "20s");
        const pollResult = await step.run(`check-image-status-${imgAttempts}`, async () => {
          let pending = false;
          for (const job of imageJobIds) {
            if (job.url) continue;
            const status = await aiOrchestrator.checkTaskStatus(job.id);
            job.state = status.state; // waiting / queuing / generating / success / fail — visible in the step output for debugging
            if (status.state === "success") {
              try {
                const r = JSON.parse(status.resultJson);
                job.url = r.resultUrls?.[0] || r.urls?.[0] || null;
              } catch { /* malformed result — treated as still-pending below */ }
              if (!job.url) pending = true;
            } else if (status.state === "fail") {
              console.error(`Kie image generation failed for scene ${job.scene} (job ${job.id}): ${status.failMsg || status.failCode || "no reason given"}`);
              if (!job.fellBack) {
                job.id = await aiOrchestrator.createImageTask(job.imagePrompt, aspectRatio);
                job.fellBack = true;
              } else {
                throw new Error(`Kie rejected scene ${job.scene} twice (job ${job.id}): ${status.failMsg || "no reason given"}`);
              }
              pending = true;
            } else {
              pending = true; // waiting / queuing / generating — normal, keep polling
            }
          }
          return { imageJobIds, allComplete: !pending };
        });
        for (let i = 0; i < imageJobIds.length; i++) { imageJobIds[i] = pollResult.imageJobIds[i]; }
        imagesDone = pollResult.allComplete;
        imgAttempts++;
      }
      if (!imagesDone) {
        const stuck = imageJobIds.filter((j) => !j.url).map((j) => `scene ${j.scene} (job ${j.id})`);
        throw new Error(`Image Generation Timed Out after ${MAX_IMAGE_ATTEMPTS} attempts. Still pending: ${stuck.join(", ")}`);
      }

      // 7. Trigger Videos in Parallel using Generated Images. Motion prompt
      // is driven by the brand archetype the script step already chose
      // (visual_mood) instead of a fixed sentence — and poster mode gets an
      // entirely different, honestly-scoped motion instruction (camera
      // movement over a static design, never "text animates in", since an
      // image-to-video model can only evolve what's already in the frame).
      const moodPhrase = MOOD_CINEMATOGRAPHY[scriptJson.visual_mood] || MOOD_CINEMATOGRAPHY.WARM_APPROACHABLE;
      const videoJobIds = await step.run("trigger-videos", async () => {
        const ids = [];
        for (let i = 0; i < imageJobIds.length; i++) {
           const imgJob = imageJobIds[i];
           // This scene's own measured narration length (clamped into
           // Kie's supported range), not a fixed "4" — see step 4.
           const clipDuration = sceneAudio[i]?.durationSeconds ?? DEFAULT_SCENE_SECONDS;
           const cinematicPrompt = isPosterMode
             ? `${imgJob.videoScenario} Smooth, slow camera movement over this static designed composition only — a gentle zoom or pan, like a camera drifting across a printed poster. Do not animate, warp, distort, or attempt to regenerate any text or graphic element — every piece of text and design must stay perfectly crisp, legible, and unchanged throughout the clip, exactly as it appears in the source image. No new elements appear that weren't already in the original image.`
             : `${imgJob.videoScenario} Cinematic ${service || intelligence.business.industry || "brand"} ad, ${moodPhrase}, shallow depth of field, smooth slow camera movement only, no cuts within clip, photorealistic quality, animate the subject naturally from the image, preserve the exact scene composition and person from the image, same color grade and lighting as the input image. The person's face, identity, body, and wardrobe must not change or drift at any point in the clip. Facial expression from the input image must be preserved exactly throughout the entire clip — do not alter or relax it. Arms and legs must move only in natural, anatomically correct ways throughout the clip — no limb bending backward, twisting, or reversing direction at any point, even briefly.`;
           const jobId = await aiOrchestrator.createVideoTask(cinematicPrompt, [imgJob.url as string], aspectRatio, String(clipDuration));
           ids.push({ id: jobId, url: null as string | null, scene: imgJob.scene, cinematicPrompt, sourceImageUrl: imgJob.url as string, durationSeconds: clipDuration, resubmitted: false, state: null as string | null });
        }
        return ids;
      });

      // 8. Poll for all videos completion. Seedance (image-to-video) is
      // markedly slower and more variable per-clip than the image model,
      // especially with up to 8 clips generating in parallel on Kie's side
      // — a clip that's still queued at minute 6 is common, not stuck, so
      // this needs a much longer budget than the image polling above
      // (~40s + 24*30s ≈ 12.5 min) before we give up on it. Same "fail"
      // detection fix as the image poll above — Kie's real failure state is
      // "fail", not "failed"/"error".
      let videosDone = false;
      let vidAttempts = 0;
      const MAX_VIDEO_ATTEMPTS = 25;
      while (!videosDone && vidAttempts < MAX_VIDEO_ATTEMPTS) {
        await step.sleep(`wait-video-${vidAttempts}`, vidAttempts === 0 ? "40s" : "30s");
        const pollResult = await step.run(`check-video-status-${vidAttempts}`, async () => {
          let pending = false;
          for (const job of videoJobIds) {
            if (job.url) continue;
            const status = await aiOrchestrator.checkTaskStatus(job.id);
            job.state = status.state; // waiting / queuing / generating / success / fail — visible in the step output for debugging
            if (status.state === "success") {
              try {
                const r = JSON.parse(status.resultJson);
                job.url = r.resultUrls?.[0] || r.urls?.[0] || null;
              } catch { /* malformed result — handled as a fail below */ }
              if (!job.url) {
                // "success" with no usable URL won't resolve itself by
                // re-polling the same finished task — treat it like an
                // explicit fail so it actually gets resubmitted.
                console.error(`Kie video "success" for scene ${job.scene} (job ${job.id}) had no parseable result URL`);
                if (!job.resubmitted) {
                  job.id = await aiOrchestrator.createVideoTask(job.cinematicPrompt, [job.sourceImageUrl], aspectRatio, String(job.durationSeconds));
                  job.resubmitted = true;
                } else {
                  throw new Error(`Kie returned no usable video URL for scene ${job.scene} twice (job ${job.id})`);
                }
                pending = true;
              } else if (!isPosterMode) {
                // Kie/Bytedance's own content-safety pass can silently swap a
                // flagged generation for a blank/near-black clip instead of
                // failing the task outright (documented as aggressive,
                // face-generation-prone moderation — exactly the kind of
                // content this pipeline generates) — a suspiciously tiny file
                // is the cheapest signal we have that this happened, without
                // decoding frames ourselves.
                const sizeBytes = await getRemoteContentLength(job.url);
                if (sizeBytes !== null && sizeBytes < job.durationSeconds * MIN_VIDEO_BYTES_PER_SECOND) {
                  console.error(`Kie video for scene ${job.scene} (job ${job.id}) is suspiciously small (${sizeBytes} bytes for ${job.durationSeconds}s) — likely a blank/moderated clip`);
                  if (!job.resubmitted) {
                    job.url = null;
                    job.id = await aiOrchestrator.createVideoTask(job.cinematicPrompt, [job.sourceImageUrl], aspectRatio, String(job.durationSeconds));
                    job.resubmitted = true;
                    pending = true;
                  } else {
                    throw new Error(`Kie returned a suspiciously blank video for scene ${job.scene} twice (job ${job.id})`);
                  }
                }
              }
            } else if (status.state === "fail") {
              console.error(`Kie video generation failed for scene ${job.scene} (job ${job.id}): ${status.failMsg || status.failCode || "no reason given"}`);
              if (!job.resubmitted) {
                job.id = await aiOrchestrator.createVideoTask(job.cinematicPrompt, [job.sourceImageUrl], aspectRatio, String(job.durationSeconds));
                job.resubmitted = true;
              } else {
                throw new Error(`Kie rejected video for scene ${job.scene} twice (job ${job.id}): ${status.failMsg || "no reason given"}`);
              }
              pending = true;
            } else {
              pending = true; // waiting / queuing / generating — normal, keep polling
            }
          }
          return { videoJobIds, allComplete: !pending };
        });
        for (let i = 0; i < videoJobIds.length; i++) { videoJobIds[i] = pollResult.videoJobIds[i]; }
        videosDone = pollResult.allComplete;
        vidAttempts++;
      }
      if (!videosDone) {
        const stuck = videoJobIds.filter((j) => !j.url).map((j) => `scene ${j.scene} (job ${j.id})`);
        throw new Error(`Video Generation Timed Out after ${MAX_VIDEO_ATTEMPTS} attempts. Still pending: ${stuck.join(", ")}`);
      }

      // 9. Stitching via FFmpeg API — each scene's own video clip paired
      // with its own narration clip (already the same length by
      // construction from step 4/7), not one clip list plus one separate
      // bulk audio track.
      const finalVideoUrl = await step.run("stitch-video", async () => {
        const clips = videoJobIds.map((job, i) => ({
          videoUrl: job.url as string,
          audioUrl: sceneAudio[i]?.url ?? null,
          durationSeconds: job.durationSeconds,
        }));
        return submitPerSceneStitchJob(clips, aspectRatio, logoUrl);
      });

      // 10. Poll for Stitching
      let stitchDone = false;
      let stitchAttempts = 0;
      let stitchedVideoUrl = "";

      while (!stitchDone && stitchAttempts < 15) {
        await step.sleep(`wait-stitch-${stitchAttempts}`, "20s");
        const pollResult = await step.run(`check-stitch-status-${stitchAttempts}`, async () => {
          const statusResult = await FFmpegService.checkStatus(finalVideoUrl);

          if (statusResult.status === "finished") {
            return { url: statusResult.url, done: true };
          } else if (statusResult.status === "failed" || statusResult.status === "error") {
            throw new Error(`FFmpeg Stitching Faile d: ${statusResult.error || 'Unknown error'}`);
          }
          return { url: "", done: false };
        });

        if (pollResult.done && pollResult.url) {
          stitchedVideoUrl = pollResult.url;
          stitchDone = true;
        }
        stitchAttempts++;
      }

      if (!stitchDone || !stitchedVideoUrl) throw new Error("Stitching Timed Out");

      // 11. Download Stitched Video and Upload to Supabase
      const finalSupabaseUrl = await step.run("upload-stitched-video", async () => {
        const { publicUrl } = await downloadAndStoreVideo(supabase, {
          sourceUrl: stitchedVideoUrl,
          storagePath: `${businessId}/meta-ads/videos/${creativeId}_${Date.now()}.mp4`,
        });
        return publicUrl;
      });

      // 12. Finalize
      await step.run("finalize", async () => {
        await supabase
          .from('meta_ad_creatives')
          .update({
            status: 'review',
            ad_script: {
              script: scriptJson.script,
              audioUrls: sceneAudio.map((a) => a.url).filter(Boolean),
              ad_mode: scriptJson.ad_mode,
              visual_mood: scriptJson.visual_mood
            },
            media_urls: [finalSupabaseUrl]
          })
          .eq('id', creativeId);
      });

      return { success: true, creativeId };
    } catch (e: any) {
      await supabase
        .from('meta_ad_creatives')
        .update({ status: 'failed' })
        .eq('id', creativeId);
      throw e;
    }
  }
);
