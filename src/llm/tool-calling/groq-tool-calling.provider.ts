import Groq from "groq-sdk";
import { env, requireGroqApiKey } from "../../config/env.js";
import type {
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

export class GroqToolCallingProvider implements ToolCallingLlmProvider {
  private readonly client: Groq;

  constructor() {
    this.client = new Groq({ apiKey: requireGroqApiKey() });
  }

  async completeWithTools(
    request: ToolCallingRequest,
  ): Promise<ToolCallingTurnResponse> {
    const startedAt = performance.now();

    // O cast fica somente na fronteira do SDK. Internamente mantemos nosso
    // contrato normalizado, independente do provider.
    const completion = await this.client.chat.completions.create({
      model: env.GROQ_TOOL_MODEL,
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
      model: completion.model ?? env.GROQ_TOOL_MODEL,
      latencyMs,
      usage: {
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens,
      },
    };
  }
}
