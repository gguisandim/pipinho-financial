import { describe, expect, it } from "vitest";
import { ToolCallingFinancialService } from "../src/services/tool-calling-financial.service.js";
import type {
  ToolCallingLlmProvider,
  ToolCallingRequest,
  ToolCallingTurnResponse,
} from "../src/llm/tool-calling/tool-calling.types.js";

class FakeToolCallingProvider implements ToolCallingLlmProvider {
  readonly requests: ToolCallingRequest[] = [];

  async completeWithTools(
    request: ToolCallingRequest,
  ): Promise<ToolCallingTurnResponse> {
    this.requests.push(request);

    if (this.requests.length === 1) {
      return {
        text: null,
        toolCalls: [
          {
            id: "call_period",
            type: "function",
            function: {
              name: "get_financial_period",
              arguments: "{}",
            },
          },
        ],
        finishReason: "tool_calls",
        provider: "fake",
        model: "fake-model",
        latencyMs: 1,
        usage: {},
      };
    }

    return {
      text: "Dados disponíveis de 1 a 14 de agosto de 2026.",
      toolCalls: [],
      finishReason: "stop",
      provider: "fake",
      model: "fake-model",
      latencyMs: 1,
      usage: {},
    };
  }
}

describe("ToolCallingFinancialService", () => {
  it("remove as tools no turno final do Ciclo 3", async () => {
    const provider = new FakeToolCallingProvider();
    const service = new ToolCallingFinancialService(provider);

    const result = await service.answer("Qual período financeiro está disponível?");

    expect(result.answer).toContain("1 a 14 de agosto");
    expect(provider.requests).toHaveLength(2);

    expect(provider.requests[0]?.tools?.length).toBeGreaterThan(0);
    expect(provider.requests[0]?.toolChoice).toBe("auto");

    expect(provider.requests[1]?.tools).toBeUndefined();
    expect(provider.requests[1]?.toolChoice).toBeUndefined();
    expect(provider.requests[1]?.parallelToolCalls).toBeUndefined();
  });
});
