
import { GoogleGenAI, Modality } from "@google/genai";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface GeminiGenerationOptions {
  model?: string;
  useDeepThink?: boolean;
  thinkingBudget?: number;
}

export class GeminiService {
  // Always obtain a fresh GoogleGenAI instance using process.env.API_KEY.
  private get ai() {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  private async withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      const errorStr = JSON.stringify(error);
      const isRateLimit = error?.message?.includes('429') || errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED');
      if (isRateLimit && retries > 0) {
        await sleep(delay);
        return this.withRetry(fn, retries - 1, delay * 2);
      }
      throw error;
    }
  }

  /**
   * Generates a conversational podcast script with optional reasoning (thinking budget).
   */
  async generateScriptFromTopic(topic: string, options: GeminiGenerationOptions = {}): Promise<string> {
    // Default model if not specified.
    const modelName = options.model || "gemini-3-flash-preview";
    
    return this.withRetry(async () => {
      // Must use ai.models.generateContent directly with a fresh instance.
      const response = await this.ai.models.generateContent({
        model: modelName,
        contents: `Create a professional 2-person podcast script about: "${topic}". 
        The script should feature a Host and a Guest. 
        Format as follows:
        Host: [dialogue]
        Guest: [dialogue]
        
        Ensure the tone is natural, intellectual, and approximately 1500-2000 words for a deep dive.`,
        config: {
          temperature: 0.9,
          topP: 0.95,
          topK: 64,
          // Correct thinkingConfig usage for Gemini 3/2.5 models.
          thinkingConfig: options.useDeepThink ? { thinkingBudget: options.thinkingBudget || 15000 } : undefined
        }
      });
      // Property access .text (not a method).
      return response.text || "Host: I encountered an issue generating the script context.";
    });
  }

  /**
   * Synthesizes text into audio using Gemini 2.5 Native TTS.
   */
  async generateSpeech(text: string, voiceName: string): Promise<string> {
    return this.withRetry(async () => {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          // Must be an array with single Modality.AUDIO.
          responseModalalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { 
              prebuiltVoiceConfig: { voiceName } 
            },
          },
        },
      });
      // Correct extraction of audio bytes from response.
      const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!data) throw new Error("Synthesis produced no audio payload.");
      return data;
    });
  }
}

export const gemini = new GeminiService();
