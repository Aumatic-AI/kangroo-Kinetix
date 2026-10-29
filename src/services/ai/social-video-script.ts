import { aiOrchestrator } from "./orchestrator";
import { getSocialVideoScriptPrompt, SocialVideoScriptInput } from "@/prompts/social-media/video";
import { maxSceneCountForDuration } from "@/prompts/meta-ads/video";

export interface SocialVideoScriptResult {
  ad_mode: string;
  visual_mood: string;
  script: string[];
}

/** The one place a social video script gets generated — used both by the
 * synchronous "preview the script" route (so the user can review/edit it
 * before anything else runs) and by the background generation job (when no
 * pre-approved script was supplied). Mirrors src/services/ai/video-script.ts
 * (Meta Ads' equivalent) — same defensive trimming, same rationale. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateSocialVideoScript(business: any, input: SocialVideoScriptInput): Promise<SocialVideoScriptResult> {
  const maxSceneCount = maxSceneCountForDuration(input.duration);
  const prompt = getSocialVideoScriptPrompt(business, input);

  const response = await aiOrchestrator.executeTask("text", prompt, "openai");
  const jsonStr = (response as string).replace(/```json\n?|\n?```/g, "").trim();
  const parsed = JSON.parse(jsonStr);

  // The selected duration is a floor, not an exact target (see the
  // prompt's own LENGTH section) — a richer story is allowed to use more
  // scenes, up to maxSceneCount, rather than being rushed or cut short to
  // fit an exact number. This only trims a genuine runaway past that
  // ceiling (a real safety net, since each extra scene is a real
  // image+video+narration generation), never the normal case.
  //
  // There used to also be a word-budget trim here that dropped trailing
  // lines whenever the estimated spoken length exceeded a fixed
  // "scriptLines x 4 seconds" budget — a holdover from before each scene's
  // clip was sized to its OWN measured narration length (see
  // generate-social-video.ts step 4/7, clamped 4-12s per scene, not a
  // uniform 4s). That stale check triggered often on Social's more
  // conversational, unhurried phrasing, silently shrinking a well-formed
  // script down toward its 3-line floor and producing a much shorter final
  // video than requested. Removed for the same reason it was removed from
  // Meta Ads' generateVideoScript (video-script.ts) — see that file's
  // comment for the full rationale.
  if (Array.isArray(parsed.script) && parsed.script.length > maxSceneCount) {
    parsed.script = parsed.script.slice(0, maxSceneCount);
  }

  // The narrative arc is hardcoded again (problem -> discovers the business
  // -> booking/journey -> resolved and happy) — getSocialVideoScriptPrompt
  // no longer asks the model to choose a mode, so this is set here rather
  // than trusted from the model's output. Still flows into the shared
  // getVisualPromptsPrompt exactly like before, so the before/after
  // visual-tier system and phase-based mood keep working correctly.
  parsed.ad_mode = "TRANSFORMATION";

  return parsed as SocialVideoScriptResult;
}
