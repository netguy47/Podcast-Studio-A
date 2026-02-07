
import { ModelRouter, RoutingDecision } from './modelRouter';
import { gemini } from './geminiService';
import { pollinations } from './pollinationsService';
import { AppState } from '../types';

export interface OrchestrationResult {
  script: string;
  modelUsed: string;
  costEstimate: number;
  tokensUsed: number;
}

export class ApiOrchestrator {
  static async generateScript(
    topic: string,
    state: AppState
  ): Promise<OrchestrationResult> {
    const decision = ModelRouter.selectModel(
      { 
        type: "script_generation", 
        quality: state.quality, 
        requiresReasoning: topic.length > 60 
      },
      state.apiKeys
    );

    let scriptText = "";

    try {
      if (decision.model.provider === 'gemini') {
        scriptText = await gemini.generateScriptFromTopic(topic, {
          model: decision.modelId,
          useDeepThink: state.quality === "premium",
          thinkingBudget: 15000
        });
      } else {
        const modelAlias = decision.modelId === "pollinations-script-paid" ? "openai" : "mistral";
        scriptText = await pollinations.generateScript(
          topic, 
          modelAlias, 
          state.scriptType, 
          state.apiKeys.pollinationsKey
        );
      }
    } catch (e: any) {
      throw new Error(`Orchestration failed via ${decision.model.name}: ${e.message}`);
    }

    // Simulate token counting (approx 4 chars per token)
    const tokensUsed = Math.ceil((topic.length + scriptText.length) / 4);

    this.recordProductionMetadata(decision, tokensUsed);

    return {
      script: scriptText,
      modelUsed: decision.model.name,
      costEstimate: decision.estimatedCost,
      tokensUsed
    };
  }

  private static recordProductionMetadata(decision: RoutingDecision, tokens: number) {
    try {
      const historyStr = localStorage.getItem('studio-master-history') || '[]';
      const history = JSON.parse(historyStr);
      history.push({
        timestamp: Date.now(),
        model: decision.modelId,
        modelName: decision.model.name,
        provider: decision.model.provider,
        cost: decision.estimatedCost,
        tokensUsed: tokens
      });
      localStorage.setItem('studio-master-history', JSON.stringify(history.slice(-200)));
    } catch (e) {
      console.warn("[ORCHESTRATOR] Metadata sync failed", e);
    }
  }
}
