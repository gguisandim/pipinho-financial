import { randomUUID } from "node:crypto";
import Groq from "groq-sdk";
import { env, requireGroqApiKey } from "../../config/env.js";
import { withLlmRetry } from "../providers/llm-retry.js";
import type {
  NormalizedToolCall,
  ToolCallingLlmProvider,
  ToolCallingMessage,
  ToolCallingRequest,
  ToolCallingTurnResponse,
} from "./tool-calling.types.js";

function toGroqMessages(messages: ToolCallingMessage[]) {
  return messages.map((message) => {
    if (message.role === "assistant") {
      return {
        role: "assistant" as const,
        content: message.content,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((toolCall) => ({
                id: toolCall.id,
                type: "function" as const,
                function: {
                  name: toolCall.function.name,
                  arguments: toolCall.function.arguments,
                },
              })),
            }
          : {}),
      };
    }

    if (message.role === "tool") {
      return {
        role: "tool" as const,
        tool_call_id: message.toolCallId,
        name: message.name,
        content: message.content,
      };
    }

    return {
      role: message.role,
      content: message.content,
    };
  });
}

interface GroqToolUseErrorShape {
  status?: number;
  error?: {
    error?: {
      code?: string;
      failed_generation?: string;
    };
  };
}

/**
 * A Groq pode rejeitar uma geração de tool call antes de devolvê-la ao
 * cliente. `failed_generation` nem sempre é JSON válido — por exemplo, o
 * modelo pode gerar `"arguments": {"{}"}` para uma função sem argumentos.
 *
 * Tentamos duas camadas de recuperação:
 * 1. JSON.parse normal, quando o payload é válido;
 * 2. extração conservadora do nome e dos argumentos quando o envelope veio
 *    malformado. Só convertemos explicitamente representações inequívocas de
 *    "sem argumentos" para `{}`. Qualquer outro argumento malformado é enviado
 *    como um objeto sentinela para que Zod/guards locais o rejeitem e o agent
 *    loop tenha a oportunidade de tentar novamente, em vez de executar uma
 *    chamada potencialmente diferente da intenção original.
 */
function recoverMalformedToolIntent(raw: string): {
  name: string;
  arguments: string;
} | null {
  const nameMatch = raw.match(/["']name["']\s*:\s*["']([^"']+)["']/i);
  const name = nameMatch?.[1]?.trim();
  if (!name) return null;

  const argumentsIndex = raw.search(/["']arguments["']\s*:/i);
  if (argumentsIndex < 0) {
    return { name, arguments: "{}" };
  }

  const afterKey = raw
    .slice(argumentsIndex)
    .replace(/^[\s\S]*?["']arguments["']\s*:\s*/i, "")
    .trim();

  // Formas observadas de uma tool sem argumentos:
  // {}, "{}", {"{}"}, { '{}'}, seguidas ou não do fechamento do envelope.
  if (
    /^\{\s*\}\s*\}?\s*$/.test(afterKey) ||
    /^["']\{\}["']\s*\}?\s*$/.test(afterKey) ||
    /^\{\s*["']\{\}["']\s*\}\s*["']?\s*\}?\s*$/.test(afterKey) ||
    /^null\s*\}?\s*$/.test(afterKey)
  ) {
    return { name, arguments: "{}" };
  }

  // Procura o primeiro objeto JSON balanceado após `arguments:`. Isso recupera
  // casos em que apenas o fechamento do envelope externo ficou corrompido.
  const objectStart = afterKey.indexOf("{");
  if (objectStart >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = objectStart; index < afterKey.length; index += 1) {
      const char = afterKey[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = afterKey.slice(objectStart, index + 1);
          try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              return { name, arguments: JSON.stringify(parsed) };
            }
          } catch {
            break;
          }
        }
      }
    }
  }

  // Nunca transformamos argumentos ambíguos em `{}` porque isso poderia mudar
  // o significado da consulta (ex.: perder datas de julho). O sentinela é
  // propositalmente incompatível com os schemas strict das financial tools.
  return {
    name,
    arguments: JSON.stringify({
      __malformed_provider_arguments__: raw.slice(0, 500),
    }),
  };
}

export function recoverToolCallFromGroqError(
  error: unknown,
): NormalizedToolCall | null {
  const candidate = error as GroqToolUseErrorShape;
  const providerError = candidate.error?.error;

  if (
    candidate.status !== 400 ||
    providerError?.code !== "tool_use_failed" ||
    typeof providerError.failed_generation !== "string"
  ) {
    return null;
  }

  const raw = providerError.failed_generation;

  try {
    const parsed = JSON.parse(raw) as {
      name?: unknown;
      arguments?: unknown;
    };

    if (typeof parsed.name !== "string" || !parsed.name.trim()) return null;

    return {
      id: `recovered_${randomUUID()}`,
      type: "function",
      function: {
        name: parsed.name,
        arguments:
          typeof parsed.arguments === "string"
            ? parsed.arguments
            : JSON.stringify(parsed.arguments ?? {}),
      },
    };
  } catch {
    const recovered = recoverMalformedToolIntent(raw);
    if (!recovered) return null;

    return {
      id: `recovered_${randomUUID()}`,
      type: "function",
      function: recovered,
    };
  }
}

export class GroqToolCallingProvider implements ToolCallingLlmProvider {
  private readonly client: Groq;

  constructor(private readonly model: string = env.GROQ_TOOL_MODEL) {
    this.client = new Groq({ apiKey: requireGroqApiKey() });
  }

  async completeWithTools(
    request: ToolCallingRequest,
  ): Promise<ToolCallingTurnResponse> {
    const startedAt = performance.now();

    try {
      // O cast fica somente na fronteira do SDK. Internamente mantemos nosso
      // contrato normalizado, independente do provider.
      const completion = await withLlmRetry(
        () =>
          this.client.chat.completions.create({
            model: this.model,
            temperature: 0,
            reasoning_effort: "low",
            max_completion_tokens: 1000,
            messages: toGroqMessages(request.messages) as never,
            ...(request.tools
              ? {
                  tools: request.tools as never,
                  tool_choice: request.toolChoice ?? "auto",
                  parallel_tool_calls: request.parallelToolCalls ?? true,
                }
              : {}),
          }),
        {
          maxRetries: env.GROQ_REQUEST_RETRIES,
          baseDelayMs: env.GROQ_RETRY_BASE_MS,
        },
      );

      const latencyMs = Math.round(performance.now() - startedAt);
      const choice = completion.choices[0];
      const message = choice?.message;

      if (!message) {
        throw new Error("A Groq não retornou uma mensagem no turno de tool calling.");
      }

      const rawToolCalls = (message.tool_calls ?? []) as Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;

      const toolCalls = rawToolCalls.map((toolCall) => ({
        id: toolCall.id,
        type: "function" as const,
        function: {
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        },
      }));

      return {
        text: message.content ?? null,
        toolCalls,
        finishReason: choice.finish_reason ?? null,
        provider: "groq",
        model: completion.model ?? this.model,
        latencyMs,
        usage: {
          promptTokens: completion.usage?.prompt_tokens,
          completionTokens: completion.usage?.completion_tokens,
          totalTokens: completion.usage?.total_tokens,
        },
      };
    } catch (error) {
      const recoveredToolCall = recoverToolCallFromGroqError(error);
      if (!recoveredToolCall) throw error;

      return {
        text: null,
        toolCalls: [recoveredToolCall],
        finishReason: "tool_use_failed_recovered",
        provider: "groq",
        model: this.model,
        latencyMs: Math.round(performance.now() - startedAt),
        usage: {},
      };
    }
  }
}
