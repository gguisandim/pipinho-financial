export interface LlmRequest {
  system: string;
  user: string;
}

export interface LlmUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface LlmResponse {
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
  usage: LlmUsage;
}

export interface LlmProvider {
  complete(request: LlmRequest): Promise<LlmResponse>;
}
