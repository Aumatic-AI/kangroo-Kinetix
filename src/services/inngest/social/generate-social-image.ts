import { inngest } from "../client";
import { aiOrchestrator } from "../../ai/orchestrator";
import { createClient } from "@supabase/supabase-js";
import { getSocialCaptionPrompt, formatPlatformCaptions, SocialPlatform } from "../../../prompts/social-media";
import { getSocialImagePrompt } from "../../../prompts/social-media/image";
import { env } from "@/config";

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Generates one image (+ per-platform captions, if any platforms were
 * selected) for an organic social post. Mirrors the proven Meta Ads image
 * pipeline (`generate-image-ad.ts`) step for step — same Kie AI call,
 * same polling pattern — but writes into `media_assets` (the reusable
 * library) instead of `meta_ad_creatives`, and fans out into one
 * `social_posts` row per selected platform sharing that asset.
 *
 * `platforms`/`socialPostIds` may both be empty — content can be created
 * purely to sit in the Media Library with no platform picked yet.
 */
export const generateSocialImage = inngest.createFunction(
  { id: "generate-social-image", triggers: [{ event: "social/generate-image" }] },
  async ({ event, step }) => {
    const { businessId, ideaPrompt, aspectRatio, platforms = [], socialPostIds = [] } = event.data as {
      businessId: string;
      ideaPrompt: string;
      aspectRatio?: "16:9" | "9:16" | "4:5" | "1:1";
      platforms?: SocialPlatform[];
      socialPostIds?: string[];
    };

    try {
      const business = await step.run("fetch-business", async () => {
        const { data } = await supabase.from("businesses").select("*").eq("id", businessId).single();
        return data || {};
      });

      // 1. Caption metadata + per-platform formatting — only if this will
      // actually become a post somewhere; skip the AI call otherwise.
      let platformCaptions: ReturnType<typeof formatPlatformCaptions> = {};
      let captionMeta: any = null;
      if (platforms.length) {
        captionMeta = await step.run("generate-captions", async () => {
          const prompt = getSocialCaptionPrompt(business, { ideaPrompt, contentType: "image" });
          const response = await aiOrchestrator.executeTask("analysis", prompt.user, "openai", { systemPrompt: prompt.system });
          const jsonStr = (response as string).replace(/```json\n?|\n?```/g, "").trim();
          return JSON.parse(jsonStr);
        });
        platformCaptions = formatPlatformCaptions(captionMeta, platforms);
      }

      // 2. Visual prompt + Kie image generation (same call shape as the Meta Ads job)
      const visualPrompt = getSocialImagePrompt(business, ideaPrompt);
      const jobId = await step.run("trigger-image", async () => {
        const response = await aiOrchestrator.executeTask("text", visualPrompt, "openai");
        const promptText = (response as string).trim();
        return { kieJobId: await aiOrchestrator.createImageTask(promptText, aspectRatio || "4:5"), promptText };
      });

      // A single nano-banana image typically finishes well under 20s, so
      // check soon and often rather than blocking a flat 30s up front.
      let imageUrl: string | null = null;
      let attempts = 0;
      const MAX_ATTEMPTS = 24;
      while (!imageUrl && attempts < MAX_ATTEMPTS) {
        await step.sleep(`wait-image-${attempts}`, attempts === 0 ? "8s" : "6s");
        const status = await step.run(`check-image-status-${attempts}`, async () => {
          return await aiOrchestrator.checkTaskStatus(jobId.kieJobId);
        });
        if (status.state === "success") {
          try {
            const resultJson = JSON.parse(status.resultJson);
            imageUrl = resultJson.resultUrls?.[0] || resultJson.urls?.[0] || null;
          } catch {
            imageUrl = null;
          }
        } else if (status.state === "fail") {
          throw new Error(`Kie AI Image Generation Failed: ${status.failMsg || status.failCode || "no reason given"}`);
        }
        attempts++;
      }
      if (!imageUrl) throw new Error(`Image Generation Timed Out after ${MAX_ATTEMPTS} attempts`);
      const finalImageUrl: string = imageUrl;

      // 3. Download + re-upload into our own storage — media_assets is a
      // durable, reusable library, so it shouldn't point at Kie's own
      // (potentially temporary) result URL the way meta_ad_creatives does.
      const stored = await step.run("store-media-asset", async () => {
        const res = await fetch(finalImageUrl);
        if (!res.ok) throw new Error(`Failed to download generated image: ${res.status}`);
        const buffer = await res.arrayBuffer();

        const fileName = `${businessId}/social/images/${Date.now()}.png`;
        const { error } = await supabase.storage.from("business_media").upload(fileName, buffer, { contentType: "image/png" });
        if (error) throw new Error("Image upload failed: " + error.message);

        const { data: publicUrlData } = supabase.storage.from("business_media").getPublicUrl(fileName);

        const { data: asset, error: assetError } = await supabase
          .from("media_assets")
          .insert({
            business_id: businessId,
            type: "image",
            source: "ai_generated",
            bucket: "business_media",
            storage_path: fileName,
            mime_type: "image/png",
            size_bytes: buffer.byteLength,
            metadata: { publicUrl: publicUrlData.publicUrl, prompt: jobId.promptText, ideaPrompt, aspectRatio },
          })
          .select()
          .single();
        if (assetError || !asset) throw new Error("Failed to save media asset: " + assetError?.message);

        return { assetId: asset.id, publicUrl: publicUrlData.publicUrl };
      });

      // 4. Finalize every social_posts row with the shared asset + its own
      // caption — there may be none, if this was generated straight into
      // the Media Library with no platform selected yet.
      if (socialPostIds.length) {
        await step.run("finalize", async () => {
          for (let i = 0; i < socialPostIds.length; i++) {
            const platform = platforms[i];
            const platformCaption = platformCaptions[platform];
            await supabase
              .from("social_posts")
              .update({
                status: "draft",
                media_asset_id: stored.assetId,
                caption: platformCaption?.text || captionMeta?.caption || "",
                title: platformCaption?.title || null,
                generation_inputs: { ideaPrompt, captionMeta, aspectRatio },
              })
              .eq("id", socialPostIds[i]);
          }
        });
      }

      return { success: true, socialPostIds, mediaAssetId: stored.assetId };
    } catch (e: any) {
      if (socialPostIds.length) {
        await supabase
          .from("social_posts")
          .update({ status: "failed", error_message: String(e.message || e).slice(0, 500) })
          .in("id", socialPostIds);
      }
      throw e;
    }
  }
);
