import Groq from "groq-sdk";
import { env, requireGroqApiKey } from "../../config/env.js";
import type { LlmProvider, LlmRequest, LlmResponse } from "./llm-provider.js";

export class GroqProvider implements LlmProvider {
  private readonly client: Groq;

  constructor(private readonly model: string = env.GROQ_MODEL) {
    this.client = new Groq({ apiKey: requireGroqApiKey() });
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const startedAt = performance.now();

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
    });

    const latencyMs = Math.round(performance.now() - startedAt);
    const text = completion.choices[0]?.message?.content ?? "";

    return {
      text,
      provider: "groq",
      model: completion.model ?? this.model,
      latencyMs,
      usage: {
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens,
      },
    };
  }
}
