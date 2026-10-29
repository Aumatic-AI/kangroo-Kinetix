import { inngest } from "../client";
import { aiOrchestrator } from "../../ai/orchestrator";
import { createClient } from "@supabase/supabase-js";
import { getAdEditPrompt } from "../../../prompts/meta-ads/ad-studio/edit";
import { downloadAndStoreImage } from "./store-creative-image";
import { env } from "@/config";

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY!
);

export const editStudioImage = inngest.createFunction(
  {
    id: "edit-studio-image",
    triggers: [{ event: "meta-ads/edit-studio-image" }]
  },
  async ({ event, step }) => {
    const { sessionId, creativeId, rawImageUrl, aspectRatio, editInstruction } = event.data;

    if (!sessionId || !creativeId || !rawImageUrl) {
      throw new Error("sessionId, creativeId and rawImageUrl are required");
    }

    try {
      // The current image IS the whole ad now (no separate poster state to
      // preserve) — an edit just re-runs generation against it with the
      // instruction applied.
      const creative = await step.run("fetch-creative", async () => {
        const { data } = await supabase.from("meta_ad_creatives").select("business_id, media_urls, revision_history").eq("id", creativeId).single();
        return data;
      });

      const editPrompt = getAdEditPrompt(editInstruction);

      const jobId = await step.run("trigger-edit", async () => {
        return await aiOrchestrator.createImageTask(editPrompt, aspectRatio, rawImageUrl, "reference");
      });

      let newImageUrl: string | null = null;
      let attempts = 0;
      const MAX_ATTEMPTS = 24;

      while (!newImageUrl && attempts < MAX_ATTEMPTS) {
        await step.sleep(`wait-edit-${attempts}`, attempts === 0 ? "8s" : "6s");

        const status = await step.run(`check-edit-status-${attempts}`, async () => {
          return await aiOrchestrator.checkTaskStatus(jobId);
        });

        if (status.state === "success") {
          try {
            const resultJson = JSON.parse(status.resultJson);
            newImageUrl = resultJson.resultUrls?.[0] || resultJson.urls?.[0] || null;
          } catch {
            console.error("Failed to parse Kie AI resultJson:", status.resultJson);
            newImageUrl = null;
          }
        } else if (status.state === "fail") {
          throw new Error(`Kie AI Edit Failed: ${status.failMsg || status.failCode || "no reason given"}`);
        }
        attempts++;
      }

      if (!newImageUrl) throw new Error("Kie AI Edit Timed Out");

      // Download + re-upload into our own storage — same reasoning as
      // generate-studio-image.ts's own "store-image" step.
      const storedImageUrl = await step.run("store-image", async () => {
        return await downloadAndStoreImage(supabase, creative!.business_id, newImageUrl as string);
      });

      await step.run("finalize", async () => {
        const priorHistory = Array.isArray(creative?.revision_history) ? creative.revision_history : [];
        const nextHistory = [
          ...priorHistory,
          {
            prior_media_urls: creative?.media_urls ?? [],
            action: `chat edit: ${editInstruction}`,
            at: new Date().toISOString(),
          },
        ];

        await supabase
          .from("meta_ad_creatives")
          .update({ media_urls: [storedImageUrl], revision_history: nextHistory })
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
      await supabase.from("studio_messages").insert({
        session_id: sessionId,
        role: "assistant",
        kind: "text",
        content: `That edit didn't go through: ${e?.message || "unknown error"}`,
      });
      throw e;
    }
  }
);
