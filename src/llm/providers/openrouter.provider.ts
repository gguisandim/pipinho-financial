import { env, requireOpenRouterApiKey } from "../../config/env.js";
import { OpenAiCompatibleTextProvider } from "../openai-compatible/openai-compatible.js";

export class OpenRouterProvider extends OpenAiCompatibleTextProvider {
  constructor(model: string = env.OPENROUTER_FINAL_MODEL) {
    super({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api",
      apiKey: requireOpenRouterApiKey(),
      model,
      timeoutMs: env.OPENROUTER_TIMEOUT_MS,
      headers: {
        "X-Title": "finance-llm-lab",
      },
    });
  }
}
