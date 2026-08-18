import type { z } from "zod";
import type { LlmUsage } from "./llm-provider.js";

export interface StructuredLlmRequest<T> {
  system: string;
  user: string;
  schemaName: string;
  schema: z.ZodType<T>;
  maxCompletionTokens?: number;
}

export interface StructuredLlmResponse<T> {
  data: T;
  rawText: string;
  provider: string;
  model: string;
  latencyMs: number;
  usage: LlmUsage;
}

export interface StructuredLlmProvider {
  completeStructured<T>(
    request: StructuredLlmRequest<T>,
  ): Promise<StructuredLlmResponse<T>>;
}
