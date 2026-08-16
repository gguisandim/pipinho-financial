import { describe, expect, it } from "vitest";
import { ToolCallingFinancialService } from "../src/services/tool-calling-financial.service.js";
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

class FakeToolCallingProvider implements ToolCallingLlmProvider {
  readonly requests: ToolCallingRequest[] = [];

  async completeWithTools(
    request: ToolCallingRequest,
  ): Promise<ToolCallingTurnResponse> {
    this.requests.push(request);

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
      provider: "fake-tools",
      model: "fake-tool-model",
      latencyMs: 1,
      usage: {},
    };
  }
}

class FakeFinalProvider implements LlmProvider {
  readonly requests: LlmRequest[] = [];

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push(request);

    return {
      text: "Dados disponíveis de 1 a 14 de agosto de 2026.",
      provider: "fake-final",
      model: "fake-final-model",
      latencyMs: 1,
      usage: {},
    };
  }
}

describe("ToolCallingFinancialService", () => {
  it("faz uma rodada de tools e sintetiza em uma chamada limpa sem histórico de tool calling", async () => {
    const toolProvider = new FakeToolCallingProvider();
    const finalProvider = new FakeFinalProvider();
    const service = new ToolCallingFinancialService(toolProvider, finalProvider);

    const result = await service.answer("Qual período financeiro está disponível?");

    expect(result.answer).toContain("1 a 14 de agosto");
    expect(toolProvider.requests).toHaveLength(1);
    expect(finalProvider.requests).toHaveLength(1);

    expect(toolProvider.requests[0]?.tools?.length).toBeGreaterThan(0);
    expect(toolProvider.requests[0]?.toolChoice).toBe("auto");

    const finalRequest = finalProvider.requests[0];
    expect(finalRequest?.user).toContain("get_financial_period");
    expect(finalRequest?.user).toContain("2026-08-01");
    expect(finalRequest?.system).toContain("NÃO possui ferramentas");
  });
});
