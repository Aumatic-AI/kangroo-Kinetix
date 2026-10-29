import { inngest } from "../client";
import { aiOrchestrator } from "../../ai/orchestrator";
import { createClient } from "@supabase/supabase-js";
import { getStudioAdPrompt } from "../../../prompts/meta-ads/ad-studio/generate";
import { downloadAndStoreImage } from "./store-creative-image";
import { env } from "@/config";

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY!
);

export const generateStudioImage = inngest.createFunction(
  {
    id: "generate-studio-image",
    triggers: [{ event: "meta-ads/generate-studio-image" }]
  },
  async ({ event, step }) => {
    const { sessionId, businessId, creativeId, service, initialIdea, qaBrief, referenceImageUrl, aspectRatio } = event.data;

    if (!sessionId || !creativeId) throw new Error("sessionId and creativeId are required");

    try {
      const intelligence = await step.run("fetch-intelligence", async () => {
        const { data: businessData } = await supabase
          .from("businesses")
          .select("*")
          .eq("id", businessId)
          .single();

        return { business: businessData || {} };
      });

      const prompt = getStudioAdPrompt(intelligence, {
        service,
        initialIdea,
        qaBrief: qaBrief || [],
        hasReferenceImage: !!referenceImageUrl,
        aspectRatio,
      });

      // The giant prompt above goes straight to the image model — no
      // OpenAI text pass in between distilling it down. Both the user's
      // reference photo and the business's own logo (if it has one) go
      // along as reference images; the prompt itself tells the model how
      // to tell them apart and use each one.
      const referenceImages = [referenceImageUrl, intelligence.business.logo_url].filter(Boolean);

      const jobId = await step.run("trigger-image", async () => {
        return await aiOrchestrator.createImageTask(prompt, aspectRatio, referenceImages, "reference");
      });

      let finalImageUrl: string | null = null;
      let attempts = 0;
      const MAX_ATTEMPTS = 24;

      while (!finalImageUrl && attempts < MAX_ATTEMPTS) {
        await step.sleep(`wait-image-${attempts}`, attempts === 0 ? "8s" : "6s");

        const status = await step.run(`check-image-status-${attempts}`, async () => {
          return await aiOrchestrator.checkTaskStatus(jobId);
        });

        if (status.state === "success") {
          try {
            const resultJson = JSON.parse(status.resultJson);
            finalImageUrl = resultJson.resultUrls?.[0] || resultJson.urls?.[0] || null;
          } catch {
            console.error("Failed to parse Kie AI resultJson:", status.resultJson);
            finalImageUrl = null;
          }
        } else if (status.state === "fail") {
          throw new Error(`Kie AI Image Generation Failed: ${status.failMsg || status.failCode || "no reason given"}`);
        }
        attempts++;
      }

      if (!finalImageUrl) throw new Error("Kie AI Image Generation Timed Out");

      // Download + re-upload into our own storage — every downstream
      // record (the creative, the session, the chat message) should point
      // at our own durable URL, not Kie's own (potentially temporary) one.
      const storedImageUrl = await step.run("store-image", async () => {
        return await downloadAndStoreImage(supabase, businessId, finalImageUrl as string);
      });

      await step.run("finalize", async () => {
        await supabase
          .from("meta_ad_creatives")
          .update({
            status: "review",
            media_urls: [storedImageUrl],
          })
          .eq("id", creativeId);

        await supabase
          .from("studio_sessions")
          .update({ status: "reviewing", raw_image_url: storedImageUrl })
          .eq("id", sessionId);

        await supabase.from("studio_messages").insert({
          session_id: sessionId,
          role: "assistant",
          kind: "image",
          payload: { imageUrl: storedImageUrl },
        });
      });

      return { success: true, creativeId };
    } catch (e: any) {
      await supabase.from("meta_ad_creatives").update({ status: "failed" }).eq("id", creativeId);
      await supabase.from("studio_sessions").update({ status: "failed" }).eq("id", sessionId);
      await supabase.from("studio_messages").insert({
        session_id: sessionId,
        role: "assistant",
        kind: "text",
        content: `Something went wrong generating that ad: ${e?.message || "unknown error"}`,
      });
      throw e;
    }
  }
);
