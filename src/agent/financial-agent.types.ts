import type { LlmUsage } from "../llm/providers/llm-provider.js";

export interface AgentToolTrace {
  iteration: number;
  id: string;
  name: string;
  arguments: unknown;
  outcome: "executed" | "rejected";
  result: unknown;
}

export interface AgentTurnTrace {
  iteration: number;
  model: string;
  latencyMs: number;
  usage: LlmUsage;
  finishReason: string | null;
  toolCallCount: number;
}

export type AgentTermination =
  | "model_answer"
  | "max_iterations_fallback"
  | "tool_budget_fallback"
  | "empty_turn_fallback";
