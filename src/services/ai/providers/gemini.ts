import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '@/config';

// Initialize the Gemini client
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY || "");

export class GeminiService {
  /**
   * Generate text using Gemini 2.5 Pro (High capability)
   */
  static async generateTextPro(prompt: string) {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error("Gemini 2.5 Pro Error:", error);
      throw error;
    }
  }

  /**
   * Generate text using Gemini 2.5 Flash (High speed, cost-effective)
   */
  static async generateTextFlash(prompt: string) {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error("Gemini 2.5 Flash Error:", error);
      throw error;
    }
  }
}
