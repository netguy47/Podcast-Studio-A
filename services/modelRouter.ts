
import { MODEL_REGISTRY } from '../constants';
import { ModelConfig, UserApiKeys } from '../types';

export interface RoutingDecision {
  modelId: string;
  model: ModelConfig;
  reason: string;
  estimatedCost: number;
}

export class ModelRouter {
  /**
   * Selects the optimal model for a given task based on quality requirements and available keys.
   */
  static selectModel(
    task: {
      type: "script_generation" | "image_generation" | "audio_synthesis";
      quality: "fast" | "balanced" | "premium";
      requiresReasoning?: boolean;
    },
    userKeys: UserApiKeys
  ): RoutingDecision {
    const hasPollinationsKey = !!userKeys.pollinationsKey;

    // SCRIPT GENERATION ROUTING
    if (task.type === "script_generation") {
      if (task.quality === "premium" || task.requiresReasoning) {
        return {
          modelId: "gemini-3-pro-preview",
          model: MODEL_REGISTRY["gemini-3-pro-preview"],
          reason: "Advanced reasoning required or premium quality selected (Gemini 3 Pro)",
          estimatedCost: 0.005,
        };
      }

      if (task.quality === "balanced" && hasPollinationsKey) {
        return {
          modelId: "pollinations-script-paid",
          model: MODEL_REGISTRY["pollinations-script-paid"],
          reason: "Utilizing Pollinations GPT-4o for balanced production",
          estimatedCost: 0.002,
        };
      }

      return {
        modelId: "pollinations-script-free",
        model: MODEL_REGISTRY["pollinations-script-free"],
        reason: "Standard fast script generation (Free tier)",
        estimatedCost: 0,
      };
    }

    // IMAGE GENERATION ROUTING
    if (task.type === "image_generation") {
      if (task.quality === "premium" && hasPollinationsKey) {
        return {
          modelId: "pollinations-image-flux",
          model: MODEL_REGISTRY["pollinations-image-flux"],
          reason: "High-fidelity visuals via Flux Pro",
          estimatedCost: 0.03,
        };
      }

      return {
        modelId: "pollinations-image-free",
        model: MODEL_REGISTRY["pollinations-image-free"],
        reason: "Free image generation using Turbo model",
        estimatedCost: 0,
      };
    }

    // AUDIO SYNTHESIS ROUTING
    if (task.type === "audio_synthesis") {
      if (task.quality === "premium") {
        return {
          modelId: "gemini-native-audio",
          model: MODEL_REGISTRY["gemini-native-audio"],
          reason: "Premium multi-speaker synthesis (Gemini 2.5 Native)",
          estimatedCost: 0.00001,
        };
      }

      return {
        modelId: "edge-neural-voices",
        model: MODEL_REGISTRY["edge-neural-voices"],
        reason: "Efficient Edge neural voices for standard production",
        estimatedCost: 0,
      };
    }

    throw new Error(`Unsupported task: ${task.type}`);
  }
}
