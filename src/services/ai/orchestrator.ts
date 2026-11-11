import { OpenAIService } from './providers/openai';
import { KieService } from './providers/kie';

export type TextProvider = 'openai';
export type TaskType = 'text' | 'analysis';

/**
 * Single entry point for every AI call in the app — no feature code should
 * import a provider service directly. Kie is the only image/video provider (Seedance 2.5 video is used by content automation only)
 */
export class AIOrchestrator {
  async executeTask(taskType: TaskType, prompt: string, provider: TextProvider = 'openai', options?: { systemPrompt?: string }): Promise<string> {
    return OpenAIService.generateText(prompt, options?.systemPrompt);
  }

  /** Text answer about images the model can see (listing photos). Throws if an image can't be fetched. */
  describeImages(prompt: string, imageUrls: string[], options?: { systemPrompt?: string; temperature?: number; detail?: "low" | "high" }): Promise<string> {
    return OpenAIService.generateTextWithImages(prompt, imageUrls, options?.systemPrompt, { temperature: options?.temperature, detail: options?.detail });
  }

  createImageTask(prompt: string, imageSize?: "9:16" | "4:5" | "16:9" | "1:1", referenceImages?: string | string[], mode?: "identity" | "reference", opts?: { exactRatio?: boolean; outputFormat?: "png" | "jpg" }) {
    return KieService.createImageTask(prompt, imageSize, referenceImages, mode, opts);
  }

  /** Seedance 2.5 video clip (30 s single / 20 s each of two) — content automation only. */
  createSeedanceVideoTask(opts: Parameters<typeof KieService.createSeedanceTask>[0]) {
    return KieService.createSeedanceTask(opts);
  }

  checkTaskStatus(jobId: string) {
    return KieService.checkSingleTaskStatus(jobId);
  }
}

export const aiOrchestrator = new AIOrchestrator();
