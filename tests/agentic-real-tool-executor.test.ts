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

class RetrySameToolAgent implements ToolCallingLlmProvider {
  private turn = 0;

  async completeWithTools(): Promise<ToolCallingTurnResponse> {
    this.turn += 1;
    if (this.turn <= 2) {
      return {
        text: null,
        toolCalls: [
          {
            id: `retry-${this.turn}`,
            type: "function",
            function: { name: "get_financial_period", arguments: "{}" },
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
      text: "Período recuperado após uma falha transitória.",
      toolCalls: [],
      finishReason: "stop",
      provider: "fake",
      model: "fake",
      latencyMs: 1,
      usage: {},
    };
  }
}

describe("AgenticFinancialService retry de execution_error", () => {
  it("permite repetir a mesma tool após falha transitória", async () => {
    let calls = 0;
    const service = new AgenticFinancialService(new RetrySameToolAgent(), fallback, {
      referenceDate: "2026-08-18",
      toolDefinitions: [
        {
          type: "function",
          function: {
            name: "get_financial_period",
            description: "teste",
            parameters: { type: "object", properties: {}, additionalProperties: false },
          },
        },
      ],
      toolExecutor: async () => {
        calls += 1;
        if (calls === 1) throw new Error("timeout transitório");
        return { status: "ok", source: "pluggy", start: "2025-08-16", end: "2026-08-14" };
      },
      systemPromptBuilder: () => "prompt real",
    });

    const result = await service.answer("Analise meu fluxo financeiro");
    expect(calls).toBe(2);
    expect(result.toolCalls[0]?.outcome).toBe("rejected");
    expect((result.toolCalls[0]?.result as { code?: string }).code).toBe("execution_error");
    expect(result.toolCalls[1]?.outcome).toBe("executed");
  });
});

class DerivedPeriodAgent implements ToolCallingLlmProvider {
  private turn = 0;

  async completeWithTools(): Promise<ToolCallingTurnResponse> {
    this.turn += 1;
    if (this.turn === 1) {
      return {
        text: null,
        toolCalls: [
          {
            id: "period",
            type: "function",
            function: { name: "get_financial_period", arguments: "{}" },
          },
        ],
        finishReason: "tool_calls",
        provider: "fake",
        model: "fake",
        latencyMs: 1,
        usage: {},
      };
    }
    if (this.turn === 2) {
      return {
        text: null,
        toolCalls: [
          {
            id: "cash",
            type: "function",
            function: {
              name: "get_cash_flow",
              arguments: JSON.stringify({
                startDate: "2025-08-16",
                endDate: "2026-08-14",
              }),
            },
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
      text: "Resumo concluído com o período disponível.",
      toolCalls: [],
      finishReason: "stop",
      provider: "fake",
      model: "fake",
      latencyMs: 1,
      usage: {},
    };
  }
}

describe("AgenticFinancialService normalização de período derivado", () => {
  it("remove datas que apenas repetem o período descoberto quando a pergunta é genérica", async () => {
    const received: Array<{ name: string; args: string }> = [];
    const service = new AgenticFinancialService(new DerivedPeriodAgent(), fallback, {
      referenceDate: "2026-08-18",
      toolDefinitions: [
        {
          type: "function",
          function: {
            name: "get_financial_period",
            description: "teste",
            parameters: { type: "object", properties: {}, additionalProperties: false },
          },
        },
        {
          type: "function",
          function: {
            name: "get_cash_flow",
            description: "teste",
            parameters: { type: "object", properties: {}, additionalProperties: false },
          },
        },
      ],
      toolExecutor: async (name, args) => {
        received.push({ name, args });
        if (name === "get_financial_period") {
          return {
            status: "ok",
            source: "pluggy",
            start: "2025-08-16",
            end: "2026-08-14",
          };
        }
        return {
          status: "ok",
          source: "pluggy",
          income: { quality: "insufficient" },
          savings: { available: false, estimatedSavings: null, estimatedSavingsRatePct: null },
        };
      },
      systemPromptBuilder: () => "prompt",
    });

    const result = await service.answer("Analise meu fluxo financeiro");
    expect(result.toolCalls[1]?.outcome).toBe("executed");
    expect(result.toolCalls[1]?.arguments).toEqual({});
    expect(received[1]?.args).toBe("{}");
  });
});
