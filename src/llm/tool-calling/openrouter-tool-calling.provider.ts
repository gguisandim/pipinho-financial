import { env, requireOpenRouterApiKey } from "../../config/env.js";
import { OpenAiCompatibleToolCallingProvider } from "../openai-compatible/openai-compatible.js";

export class OpenRouterToolCallingProvider extends OpenAiCompatibleToolCallingProvider {
  constructor(model: string = env.OPENROUTER_AGENT_MODEL) {
    super({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api",
      apiKey: requireOpenRouterApiKey(),
      model,
      supportsParallelToolCalls: false,
      timeoutMs: env.OPENROUTER_TIMEOUT_MS,
      headers: {
        "X-Title": "finance-llm-lab",
      },
    });
  }
}
