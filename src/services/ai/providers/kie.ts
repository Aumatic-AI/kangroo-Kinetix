import { env } from "@/config";

/** Kie model id for video generation — also recorded on each content_clips row. */
export const SEEDANCE_MODEL = "bytedance/seedance-2-5";

export class KieService {
  /**
   * Pings the API once for task status (Useful for Inngest step.sleep polling)
   */
  static async checkSingleTaskStatus(jobId: string): Promise<any> {
    console.log("[KIE_REQUEST] GET recordInfo", { jobId });
    const res = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${jobId}`, {
      headers: { Authorization: `Bearer ${env.KIE_API_KEY}` }
    });

    const response = await res.json();
    console.log("[KIE_RESPONSE] GET recordInfo", res.status, response);
    return response.data || {};
  }

  /**
   * Original inline polling implementation (keeps backwards compatibility)
   */
  private static async checkTaskStatus(jobId: string, maxRetries = 10, delayMs = 20000): Promise<any> {
    for (let i = 0; i < maxRetries; i++) {
      const status = await this.checkSingleTaskStatus(jobId);
      
      if (status.state === "success") {
        return status;
      } else if (status.state === "fail") {
        throw new Error(`Kie AI Task Failed: ${status.failMsg || status.failCode || "no reason given"}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    throw new Error(`Kie AI Task Timed Out after ${maxRetries} retries`);
  }

  /**
   * Triggers an Image Generation Task and returns the raw jobId.
   *
   * Uses Nano Banana 2 (model "nano-banana-2") — its input schema differs
   * from the original nano-banana: `aspect_ratio` instead of `image_size`,
   * and `image_input` instead of `image_urls`. It doesn't support "4:5"
   * directly, so that maps to "2:3", the closest supported portrait ratio.
   *
   * `referenceImages` conditions the generation on one or more reference
   * images (nano-banana-2 accepts up to 14 via `image_input`) — pass a
   * single URL or an array (e.g. a user reference photo plus a business
   * logo together). `mode` controls how a single reference is phrased:
   * - "identity" (default): locks the generated subject's face/identity to
   *   the reference — the mechanism the video pipelines use to keep one
   *   consistent character across every scene.
   * - "reference": passes the photo(s) through with no identity-lock
   *   phrasing, for callers whose own prompt text already says how to use
   *   them (e.g. as general visual ingredients, or "the exact starting
   *   point, edit only X").
   */
  static async createImageTask(
    prompt: string,
    imageSize: "9:16" | "4:5" | "16:9" | "1:1" = "4:5",
    referenceImages?: string | string[],
    mode: "identity" | "reference" = "identity",
    /** exactRatio: send "4:5" as-is. Kie's current docs list 4:5 as supported, but the
     * remap to 2:3 below is kept as the default so the existing Meta Ads/Social flows
     * don't change behavior; 2:3 is outside Instagram's feed range (0.8–1.91).
     * outputFormat: "jpg" for social posts (Instagram requires JPEG). */
    opts?: { exactRatio?: boolean; outputFormat?: "png" | "jpg" }
  ) {
    const referenceImageUrls = (Array.isArray(referenceImages) ? referenceImages : referenceImages ? [referenceImages] : []).filter(Boolean);

    let finalPrompt = referenceImageUrls.length > 0 && mode === "identity"
      ? `${prompt} The subject face and identity must match the reference image exactly. Facial expression is critical and must match the emotion described in the prompt precisely.`
      : prompt;

    // Kie's nano-banana-2 rejects the whole request past 20,000 characters
    // (a 500, not a validation error) — this is a hard backstop for every
    // caller, not just the one whose prompt happened to grow too long, so a
    // future unexpectedly-long prompt fails soft (a slightly truncated ad)
    // instead of not generating at all.
    const KIE_PROMPT_MAX_CHARS = 19_500;
    if (finalPrompt.length > KIE_PROMPT_MAX_CHARS) {
      console.warn(`[KIE] Prompt was ${finalPrompt.length} chars, over Kie's 20,000 limit — truncating to ${KIE_PROMPT_MAX_CHARS}.`);
      finalPrompt = finalPrompt.slice(0, KIE_PROMPT_MAX_CHARS);
    }

    const aspectRatio = imageSize === "4:5" && !opts?.exactRatio ? "2:3" : imageSize;

    const input: Record<string, unknown> = {
      prompt: finalPrompt,
      output_format: opts?.outputFormat ?? "png",
      aspect_ratio: aspectRatio,
    };
    if (referenceImageUrls.length > 0) input.image_input = referenceImageUrls;

    console.log("[KIE_REQUEST] POST createTask (image)", { model: "nano-banana-2", input });

    const response = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.KIE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "nano-banana-2",
        input,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log("[KIE_RESPONSE] POST createTask (image)", response.status, errorText);
      throw new Error(`Kie API Error: ${errorText}`);
    }

    const data = await response.json();
    console.log("[KIE_RESPONSE] POST createTask (image)", response.status, data);
    const jobId = data.taskId || data.jobId || data.id || data.data?.taskId || data.data?.jobId || data.data?.id;

    if (!jobId) throw new Error(`No jobId returned from Kie. Response data: ${JSON.stringify(data)}`);
    return jobId;
  }

  /**
   * Seedance 2.5 (Kie model SEEDANCE_MODEL = "bytedance/seedance-2-5") — used by the
   * content automation pipeline, the only video generation in the app. The model
   * allows 4–30 s; our pipeline always uses one 30 s clip (see content-automation/video-spec.ts). Reference images go in `reference_image_urls` (Kie allows 30; we send ≤ 9)
   * and native audio is on by default. Returns the raw taskId; poll it with
   * checkSingleTaskStatus.
   */
  static async createSeedanceTask(opts: {
    prompt: string;
    referenceImageUrls?: string[];
    aspectRatio?: "9:16" | "16:9" | "1:1" | "4:3" | "3:4" | "21:9" | "adaptive";
    duration: number;
    generateAudio?: boolean;
    resolution?: "480p" | "720p" | "1080p";
  }) {
    const duration = Math.round(opts.duration);
    if (duration < 4 || duration > 30) throw new Error(`Seedance duration must be 4–30 s, got ${opts.duration}`);
    const input: Record<string, unknown> = {
      prompt: opts.prompt.slice(0, 19_500),
      aspect_ratio: opts.aspectRatio ?? "9:16",
      resolution: opts.resolution ?? "480p",
      duration,
      generate_audio: opts.generateAudio ?? true,
    };
    const refs = (opts.referenceImageUrls ?? []).filter(Boolean).slice(0, 9);
    if (refs.length) input.reference_image_urls = refs;

    const requestBody = { model: SEEDANCE_MODEL, input };
    console.log("[KIE_REQUEST] POST createTask (seedance-2-5)", requestBody);

    const response = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.KIE_API_KEY}` },
      body: JSON.stringify(requestBody),
    });
    const text = await response.text();
    console.log("[KIE_RESPONSE] POST createTask (seedance-2-5)", response.status, text);
    if (!response.ok) throw new Error(`Kie API Error: ${text}`);

    let data: { code?: number; msg?: string; taskId?: string; jobId?: string; id?: string; data?: { taskId?: string; jobId?: string; id?: string } };
    try { data = JSON.parse(text); } catch { throw new Error(`Kie returned a non-JSON response: ${text.slice(0, 200)}`); }
    // Kie reports failures with HTTP 200 and a non-200 `code` in the body.
    if (data.code && data.code !== 200) throw new Error(`Kie API Error ${data.code}: ${data.msg || text.slice(0, 200)}`);
    const jobId = data.taskId || data.jobId || data.id || data.data?.taskId || data.data?.jobId || data.data?.id;
    if (!jobId) throw new Error(`No jobId returned from Kie. Response data: ${text.slice(0, 300)}`);
    return jobId as string;
  }

  static async generateImage(prompt: string, imageSize: "9:16" | "4:5" = "4:5") {
    const jobId = await this.createImageTask(prompt, imageSize);
    const result = await this.checkTaskStatus(jobId, 8, 20000);
    
    try {
      const resultJson = JSON.parse(result.resultJson);
      return resultJson.resultUrls?.[0] || resultJson.urls?.[0] || null;
    } catch (e) {
      console.error("Failed to parse Kie AI resultJson:", result.resultJson);
      return null;
    }
  }
}

