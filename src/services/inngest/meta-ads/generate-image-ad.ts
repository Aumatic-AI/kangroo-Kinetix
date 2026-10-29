import { inngest } from "../client";
import { aiOrchestrator } from "../../ai/orchestrator";
import { createClient } from "@supabase/supabase-js";
import { getImageAdPrompt } from "../../../prompts/meta-ads/image";
import { downloadAndStoreImage } from "./store-creative-image";
import { env } from "@/config";

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY!
);

export const generateImageAd = inngest.createFunction(
  { 
    id: "generate-image-ad",
    triggers: [{ event: "meta-ads/generate-image" }]
  },
  async ({ event, step }) => {
    const { ideaPrompt, service, creativeId, businessId } = event.data;

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

      // 2. Generate prompt
      const prompt = getImageAdPrompt(intelligence, { ideaPrompt, service });
      
      // 3. Generate script via LLM
      const scriptJson = await step.run("generate-script", async () => {
        const response = await aiOrchestrator.executeTask('text', prompt, 'openai');
        const jsonStr = (response as string).replace(/```json\n?|\n?```/g, "").trim();
        return JSON.parse(jsonStr);
      });

      // 4. Trigger image generation via Kie directly
      const jobId = await step.run("trigger-image", async () => {
        return await aiOrchestrator.createImageTask(scriptJson.visual_prompt, "4:5");
      });

      // 5. Poll for image completion with step.sleep — a single nano-banana
      // image typically finishes well under 20s, so check soon and often
      // rather than blocking a flat 30s before the first look.
      let imageUrl = null;
      let attempts = 0;
      const MAX_ATTEMPTS = 24;

      while (!imageUrl && attempts < MAX_ATTEMPTS) {
        // Sleep dynamically based on attempt
        await step.sleep(`wait-image-${attempts}`, attempts === 0 ? "8s" : "6s");
        
        const status = await step.run(`check-image-status-${attempts}`, async () => {
          return await aiOrchestrator.checkTaskStatus(jobId);
        });

        if (status.state === "success") {
          try {
            const resultJson = JSON.parse(status.resultJson);
            imageUrl = resultJson.resultUrls?.[0] || resultJson.urls?.[0] || null;
          } catch (e) {
            console.error("Failed to parse Kie AI resultJson:", status.resultJson);
            imageUrl = null; // Will trigger timeout if last attempt
          }
        } else if (status.state === "fail") {
          throw new Error(`Kie AI Image Generation Failed: ${status.failMsg || status.failCode || "no reason given"}`);
        }
        attempts++;
      }

      if (!imageUrl) {
        throw new Error("Kie AI Image Generation Timed Out");
      }

      // 6. Download + re-upload into our own storage — media_urls
      // shouldn't point at Kie's own (potentially temporary) result URL.
      const storedImageUrl = await step.run("store-image", async () => {
        return await downloadAndStoreImage(supabase, businessId, imageUrl as string);
      });

      // 7. Finalize
      await step.run("finalize", async () => {
        await supabase
          .from('meta_ad_creatives')
          .update({
            status: 'review',
            ad_script: {
              headline: scriptJson.headline,
              primary_text: scriptJson.primary_text
            },
            media_urls: [storedImageUrl]
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
