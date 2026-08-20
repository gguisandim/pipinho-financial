import { describe, expect, it } from "vitest";
import { routeFinancialTools, selectFinancialToolDefinitions } from "../src/agent/financial-tool-router.js";
import { AgenticFinancialService } from "../src/services/agentic-financial.service.js";
import type { ToolDefinition } from "../src/llm/tool-calling/tool-calling.types.js";
import type { ToolCallingLlmProvider } from "../src/llm/tool-calling/tool-calling.types.js";
import type { LlmProvider } from "../src/llm/providers/llm-provider.js";

const tools: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_spending_summary",
      description: "spending",
      parameters: { type: "object", properties: {}, additionalProperties: true },
    },
  },
  {
    type: "function",
    function: {
      name: "get_spending_by_institution",
      description: "institutions",
      parameters: { type: "object", properties: {}, additionalProperties: true },
    },
  },
];

const shouldNotRun: ToolCallingLlmProvider = {
  async completeWithTools() {
    throw new Error("tool-calling provider should not run in deterministic fast path");
  },
};

const synthesis: LlmProvider = {
  async complete() {
    return {
      text: "Resposta sintetizada.",
      provider: "fake",
      model: "fake",
      latencyMs: 1,
      usage: {},
    };
  },
};

function service() {
  return new AgenticFinancialService(shouldNotRun, synthesis, {
    referenceDate: "2026-08-20",
    toolDefinitions: tools,
    toolDefinitionsSelector: (question, definitions) =>
      selectFinancialToolDefinitions(question, definitions).tools,
    deterministicToolPlanner: (question) => {
      const decision = routeFinancialTools(question);
      if (decision.toolNames.length !== 1) return null;
      return { name: decision.toolNames[0]!, rawArguments: "{}" };
    },
    toolExecutor: async (name, rawArguments) => ({
      status: "ok",
      name,
      args: JSON.parse(rawArguments),
    }),
    systemPromptBuilder: () => "system",
  });
}

describe("AgenticFinancialService conversational routing", () => {
  it("herda intenção de spending mas usa o mês da pergunta atual", async () => {
    const result = await service().answer("E mês passado?", {
      history: [
        { role: "user", content: "Quanto eu gastei este mês?" },
        { role: "assistant", content: "Você gastou..." },
      ],
    });

    expect(result.executionMode).toBe("fast_path");
    expect(result.conversation.contextualRouting).toBe(true);
    expect(result.toolCalls[0]?.name).toBe("get_spending_summary");
    expect(result.toolCalls[0]?.arguments).toEqual({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });
  });

  it("herda o período anterior quando follow-up troca para Nubank", async () => {
    const result = await service().answer("E no Nubank?", {
      history: [
        { role: "user", content: "Quanto eu gastei este mês?" },
        { role: "assistant", content: "Você gastou..." },
      ],
    });

    expect(result.toolCalls[0]?.name).toBe("get_spending_by_institution");
    expect(result.toolCalls[0]?.arguments).toEqual({
      startDate: "2026-08-01",
      endDate: "2026-08-20",
    });
  });
});
