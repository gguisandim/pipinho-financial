import type { LlmUsage } from "../providers/llm-provider.js";

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface NormalizedToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export type ToolCallingMessage =
  | {
      role: "system" | "user";
      content: string;
    }
  | {
      role: "assistant";
      content: string | null;
      toolCalls?: NormalizedToolCall[];
    }
  | {
      role: "tool";
      toolCallId: string;
      name: string;
      content: string;
    };

export interface ToolCallingRequest {
  messages: ToolCallingMessage[];
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "none" | "required";
  parallelToolCalls?: boolean;
}

export interface ToolCallingTurnResponse {
  text: string | null;
  toolCalls: NormalizedToolCall[];
  finishReason: string | null;
  provider: string;
  model: string;
  latencyMs: number;
  usage: LlmUsage;
}

export interface ToolCallingLlmProvider {
  completeWithTools(
    request: ToolCallingRequest,
  ): Promise<ToolCallingTurnResponse>;
}
