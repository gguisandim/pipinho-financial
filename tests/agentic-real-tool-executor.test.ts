import { describe, expect, it } from "vitest";
import { AgenticFinancialService } from "../src/services/agentic-financial.service.js";
import type {
  ToolCallingLlmProvider,
  ToolCallingRequest,
  ToolCallingTurnResponse,
} from "../src/llm/tool-calling/tool-calling.types.js";
import type { LlmProvider, LlmResponse } from "../src/llm/providers/llm-provider.js";

class RealToolAgent implements ToolCallingLlmProvider {
  private turn = 0;
  readonly requests: ToolCallingRequest[] = [];

  async completeWithTools(request: ToolCallingRequest): Promise<ToolCallingTurnResponse> {
    this.requests.push(request);
    this.turn += 1;
    if (this.turn === 1) {
      return {
        text: null,
        toolCalls: [
          {
            id: "real-cash",
            type: "function",
            function: { name: "get_cash_flow", arguments: "{}" },
          },
        ],
        finishReason: "tool_calls",
        provider: "fake",
        model: "fake",
        latencyMs: 1,
        usage: {},
      };
    }
    return {
      text: "Não é possível calcular a taxa de poupança porque a renda está insuficientemente identificada.",
      toolCalls: [],
      finishReason: "stop",
      provider: "fake",
      model: "fake",
      latencyMs: 1,
      usage: {},
    };
  }
}

const fallback: LlmProvider = {
  async complete(): Promise<LlmResponse> {
    return {
      text: "fallback",
      provider: "fake",
      model: "fake",
      latencyMs: 1,
      usage: {},
    };
  },
};

describe("AgenticFinancialService com executor real injetado", () => {
  it("aguarda executor assíncrono e preserva quality grounding", async () => {
    let calls = 0;
    const agent = new RealToolAgent();
    const service = new AgenticFinancialService(agent, fallback, {
      referenceDate: "2026-08-17",
      toolDefinitions: [
        {
          type: "function",
          function: {
            name: "get_cash_flow",
            description: "teste",
            parameters: { type: "object", properties: {}, additionalProperties: false },
          },
        },
      ],
      toolExecutor: async () => {
        calls += 1;
        return {
          status: "ok",
          source: "pluggy",
          income: { quality: "insufficient" },
          savings: {
            available: false,
            estimatedSavings: null,
            estimatedSavingsRatePct: null,
            unavailableReason: "renda insuficientemente identificada",
          },
        };
      },
      systemPromptBuilder: () => "prompt real",
    });

    const result = await service.answer("Qual minha taxa de poupança?");
    expect(calls).toBe(1);
    expect(result.grounding.quality.passed).toBe(true);
    expect(result.answer).toContain("Não é possível calcular");
    expect(agent.requests[0]?.messages[0]?.content).toBe("prompt real");
  });
});
