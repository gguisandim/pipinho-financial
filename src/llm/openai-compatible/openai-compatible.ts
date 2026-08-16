import { randomUUID } from "node:crypto";
import type { LlmProvider, LlmRequest, LlmResponse, LlmUsage } from "../providers/llm-provider.js";
import type {
  NormalizedToolCall,
  ToolCallingLlmProvider,
  ToolCallingMessage,
  ToolCallingRequest,
  ToolCallingTurnResponse,
} from "../tool-calling/tool-calling.types.js";

export class HttpApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly headers: Headers,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "HttpApiError";
  }
}

export interface OpenAiCompatibleConfig {
  provider: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  headers?: Record<string, string>;
  supportsParallelToolCalls?: boolean;
  timeoutMs?: number;
}

interface OpenAiChatResponse {
  model?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string | Record<string, unknown>;
        };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

function endpoint(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/v1")
    ? `${normalized}/chat/completions`
    : `${normalized}/v1/chat/completions`;
}

function requestHeaders(config: OpenAiCompatibleConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    ...(config.headers ?? {}),
  };
}

function toOpenAiMessages(messages: ToolCallingMessage[]) {
  return messages.map((message) => {
    if (message.role === "assistant") {
      return {
        role: "assistant",
        content: message.content,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((toolCall) => ({
                id: toolCall.id,
                type: "function",
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
        role: "tool",
        tool_call_id: message.toolCallId,
        name: message.name,
        content: message.content,
      };
    }

    return { role: message.role, content: message.content };
  });
}

async function postChat(
  config: OpenAiCompatibleConfig,
  body: Record<string, unknown>,
): Promise<OpenAiChatResponse> {
  const response = await fetch(endpoint(config.baseUrl), {
    method: "POST",
    headers: requestHeaders(config),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.timeoutMs ?? 120000),
  });

  const raw = await response.text();
  let parsed: unknown = raw;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    // Mantém texto bruto para diagnóstico.
  }

  if (!response.ok) {
    throw new HttpApiError(
      `${config.provider} retornou HTTP ${response.status}: ${raw.slice(0, 1000)}`,
      response.status,
      response.headers,
      parsed,
    );
  }

  return parsed as OpenAiChatResponse;
}

function usageOf(response: OpenAiChatResponse): LlmUsage {
  return {
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens,
    totalTokens: response.usage?.total_tokens,
  };
}

function normalizeToolCalls(response: OpenAiChatResponse): NormalizedToolCall[] {
  const calls = response.choices?.[0]?.message?.tool_calls ?? [];

  return calls
    .filter((call) => typeof call.function?.name === "string")
    .map((call) => ({
      id: call.id || `call_${randomUUID()}`,
      type: "function" as const,
      function: {
        name: call.function?.name ?? "",
        arguments:
          typeof call.function?.arguments === "string"
            ? call.function.arguments
            : JSON.stringify(call.function?.arguments ?? {}),
      },
    }));
}

export class OpenAiCompatibleToolCallingProvider implements ToolCallingLlmProvider {
  constructor(private readonly config: OpenAiCompatibleConfig) {}

  async completeWithTools(request: ToolCallingRequest): Promise<ToolCallingTurnResponse> {
    const startedAt = performance.now();
    const response = await postChat(this.config, {
      model: this.config.model,
      temperature: 0,
      max_tokens: 1000,
      messages: toOpenAiMessages(request.messages),
      ...(request.tools
        ? {
            tools: request.tools,
            tool_choice: request.toolChoice ?? "auto",
            ...(this.config.supportsParallelToolCalls
              ? { parallel_tool_calls: request.parallelToolCalls ?? true }
              : {}),
          }
        : {}),
    });

    const choice = response.choices?.[0];
    const message = choice?.message;
    if (!message) {
      throw new Error(`${this.config.provider} não retornou uma mensagem.`);
    }

    return {
      text: message.content ?? null,
      toolCalls: normalizeToolCalls(response),
      finishReason: choice?.finish_reason ?? null,
      provider: this.config.provider,
      model: response.model ?? this.config.model,
      latencyMs: Math.round(performance.now() - startedAt),
      usage: usageOf(response),
    };
  }
}

export class OpenAiCompatibleTextProvider implements LlmProvider {
  constructor(private readonly config: OpenAiCompatibleConfig) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const startedAt = performance.now();
    const response = await postChat(this.config, {
      model: this.config.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
    });

    return {
      text: response.choices?.[0]?.message?.content ?? "",
      provider: this.config.provider,
      model: response.model ?? this.config.model,
      latencyMs: Math.round(performance.now() - startedAt),
      usage: usageOf(response),
    };
  }
}
