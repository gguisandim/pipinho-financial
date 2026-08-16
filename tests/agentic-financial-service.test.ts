import { describe, expect, it } from "vitest";
import { AgenticFinancialService } from "../src/services/agentic-financial.service.js";
import type {
  ToolCallingLlmProvider,
  ToolCallingRequest,
  ToolCallingTurnResponse,
} from "../src/llm/tool-calling/tool-calling.types.js";
import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from "../src/llm/providers/llm-provider.js";

function turn(
  toolCalls: ToolCallingTurnResponse["toolCalls"],
  text: string | null = null,
): ToolCallingTurnResponse {
  return {
    text,
    toolCalls,
    finishReason: toolCalls.length ? "tool_calls" : "stop",
    provider: "fake",
    model: "fake-agent",
    latencyMs: 1,
    usage: {},
  };
}

class RecoveringAgentProvider implements ToolCallingLlmProvider {
  readonly requests: ToolCallingRequest[] = [];
  private index = 0;

  async completeWithTools(request: ToolCallingRequest) {
    this.requests.push(request);
    this.index += 1;

    if (this.index === 1) {
      return turn([
        {
          id: "bad_date",
          type: "function",
          function: {
            name: "get_cash_flow",
            arguments: JSON.stringify({
              startDate: "2023-01-01",
              endDate: "2023-12-31",
            }),
          },
        },
      ]);
    }

    if (this.index === 2) {
      return turn([
        {
          id: "period",
          type: "function",
          function: { name: "get_financial_period", arguments: "{}" },
        },
      ]);
    }

    if (this.index === 3) {
      return turn([
        {
          id: "cashflow",
          type: "function",
          function: { name: "get_cash_flow", arguments: "{}" },
        },
      ]);
    }

    return turn([], "Seu fluxo líquido é positivo no período disponível.");
  }
}

class FakeFallback implements LlmProvider {
  readonly requests: LlmRequest[] = [];

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push(request);
    return {
      text: "fallback",
      provider: "fake",
      model: "fake-fallback",
      latencyMs: 1,
      usage: {},
    };
  }
}

describe("AgenticFinancialService", () => {
  it("usa erro de tool como feedback e se recupera em múltiplas iterações", async () => {
    const agent = new RecoveringAgentProvider();
    const fallback = new FakeFallback();
    const service = new AgenticFinancialService(agent, fallback, {
      referenceDate: "2026-08-16",
      maxIterations: 5,
      maxToolCalls: 10,
    });

    const result = await service.answer("Analise meu fluxo financeiro");

    expect(result.termination).toBe("model_answer");
    expect(result.iterations).toBe(4);
    expect(result.answer).toContain("positivo");
    expect(result.toolCalls[0]?.outcome).toBe("rejected");
    expect(
      (result.toolCalls[0]?.result as { code?: string }).code,
    ).toBe("ungrounded_date");
    expect(result.toolCalls[1]?.name).toBe("get_financial_period");
    expect(result.toolCalls[2]?.name).toBe("get_cash_flow");
    expect(fallback.requests).toHaveLength(0);

    const secondRequest = agent.requests[1];
    expect(JSON.stringify(secondRequest)).toContain("ungrounded_date");
  });
});

class CausalAgentProvider implements ToolCallingLlmProvider {
  private index = 0;

  async completeWithTools(): Promise<ToolCallingTurnResponse> {
    this.index += 1;
    if (this.index === 1) {
      return turn([
        {
          id: "category",
          type: "function",
          function: { name: "get_spending_by_category", arguments: "{}" },
        },
      ]);
    }

    return turn(
      [],
      "Housing foi a maior categoria porque custos de moradia geralmente incluem aluguel e condomínio.",
    );
  }
}

class GroundingRepairFallback implements LlmProvider {
  readonly requests: LlmRequest[] = [];

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push(request);
    return {
      text: "Housing foi a maior categoria, com R$ 1.400. Os dados agregados permitem identificar que esse total é o maior, mas não permitem determinar a causa comportamental do gasto.",
      provider: "fake",
      model: "fake-repair",
      latencyMs: 2,
      usage: { totalTokens: 20 },
    };
  }
}

describe("AgenticFinancialService causal grounding", () => {
  it("repara resposta com claim causal não sustentado antes de retornar", async () => {
    const fallback = new GroundingRepairFallback();
    const service = new AgenticFinancialService(new CausalAgentProvider(), fallback, {
      referenceDate: "2026-08-16",
    });

    const result = await service.answer("Qual foi minha maior categoria de gastos e por quê?");

    expect(result.grounding.causal.passed).toBe(true);
    expect(result.grounding.causal.repaired).toBe(true);
    expect(result.answer).not.toContain("geralmente");
    expect(result.answer).toContain("não permitem determinar a causa comportamental");
    expect(fallback.requests).toHaveLength(1);
  });
});
