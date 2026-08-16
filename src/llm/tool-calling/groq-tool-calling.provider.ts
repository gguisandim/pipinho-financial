import { randomUUID } from "node:crypto";
import Groq from "groq-sdk";
import { env, requireGroqApiKey } from "../../config/env.js";
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
 * A Groq pode validar uma tool call antes de devolvê-la normalmente. Em caso
 * de tool_use_failed, o payload costuma trazer failed_generation com a chamada
 * que o modelo tentou produzir. Recuperamos essa intenção para que a nossa
 * camada local (Zod + guards semânticos) possa rejeitar/corrigir a chamada no
 * loop, em vez de derrubar o processo inteiro.
 */
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

  try {
    const parsed = JSON.parse(providerError.failed_generation) as {
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
    return null;
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
      const completion = await this.client.chat.completions.create({
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
      });

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
