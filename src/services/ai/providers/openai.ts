import OpenAI from 'openai';
import { env } from '@/config';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export class OpenAIService {
  /**
   * Generate text using GPT-4o
   */
  static async generateText(prompt: string, systemPrompt?: string) {
    try {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      
      messages.push({ role: 'user', content: prompt });

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        temperature: 0.7,
      });

      return completion.choices[0]?.message?.content || "";
    } catch (error) {
      console.error("OpenAI Text Generation Error:", error);
      throw error;
    }
  }

  /**
   * Generate an image using DALL-E 3 (GPT Image 1 equivalents)
   */
  static async generateImage(prompt: string) {
    try {
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
      });

      return response?.data?.[0]?.url || null;
    } catch (error) {
      console.error("OpenAI Image Generation Error:", error);
      throw error;
    }
  }

  /**
   * Generate text embeddings using text-embedding-3-small or large
   */
  static async generateEmbeddings(texts: string[], useLarge: boolean = false) {
    try {
      const response = await openai.embeddings.create({
        model: useLarge ? "text-embedding-3-large" : "text-embedding-3-small",
        input: texts,
        encoding_format: "float",
      });

      return response?.data || [];
    } catch (error) {
      console.error("OpenAI Embeddings Error:", error);
      throw error;
    }
  }
}
