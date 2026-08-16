import Groq from "groq-sdk";
import { z } from "zod";
import { env, requireGroqApiKey } from "../../config/env.js";
import type {
  StructuredLlmProvider,
  StructuredLlmRequest,
  StructuredLlmResponse,
} from "./structured-llm-provider.js";

export class GroqStructuredProvider implements StructuredLlmProvider {
  private readonly client: Groq;

  constructor() {
    this.client = new Groq({ apiKey: requireGroqApiKey() });
  }

  async completeStructured<T>(
    request: StructuredLlmRequest<T>,
  ): Promise<StructuredLlmResponse<T>> {
    const jsonSchema = z.toJSONSchema(request.schema);
    const startedAt = performance.now();

    const completion = await this.client.chat.completions.create({
      model: env.GROQ_STRUCTURED_MODEL,
      temperature: 0,
      max_completion_tokens: 1200,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: request.schemaName,
          strict: true,
          schema: jsonSchema,
        },
      },
    });

    const latencyMs = Math.round(performance.now() - startedAt);
    const rawText = completion.choices[0]?.message?.content ?? "";

    if (!rawText) {
      throw new Error("A Groq retornou uma resposta estruturada vazia.");
    }

    let json: unknown;

    try {
      json = JSON.parse(rawText);
    } catch (error) {
      throw new Error(
        `A resposta da Groq não pôde ser convertida de JSON: ${error instanceof Error ? error.message : "erro desconhecido"}`,
      );
    }

    const data = request.schema.parse(json);

    return {
      data,
      rawText,
      provider: "groq",
      model: completion.model ?? env.GROQ_STRUCTURED_MODEL,
      latencyMs,
      usage: {
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens,
      },
    };
  }
}
