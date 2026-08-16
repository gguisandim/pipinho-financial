import { describe, expect, it } from "vitest";
import { scoreBenchmarkCase } from "../src/evaluation/benchmark.scoring.js";
import type { AgentToolTrace } from "../src/agent/financial-agent.types.js";

const julyTool: AgentToolTrace = {
  iteration: 1,
  id: "1",
  name: "get_cash_flow",
  arguments: { startDate: "2026-07-01", endDate: "2026-07-31" },
  outcome: "executed",
  result: { status: "no_data" },
};

describe("benchmark scoring", () => {
  it("aprova seleção, argumentos, resposta e grounding corretos", () => {
    const score = scoreBenchmarkCase({
      testCase: {
        id: "july",
        description: "test",
        question: "Quanto gastei em julho?",
        requiredTools: [
          {
            name: "get_cash_flow",
            expectedArguments: {
              startDate: "2026-07-01",
              endDate: "2026-07-31",
            },
          },
        ],
        answerMustContainAny: [["não há"], ["julho"]],
        requireCausalGrounding: true,
      },
      answer: "Não há transações em julho.",
      toolCalls: [julyTool],
    });

    expect(score.passed).toBe(true);
    expect(score.toolSelection).toBe(1);
    expect(score.argumentAccuracy).toBe(1);
  });

  it("reprova claim causal generalizado", () => {
    const score = scoreBenchmarkCase({
      testCase: {
        id: "causal",
        description: "test",
        question: "Por quê?",
        requiredTools: [{ name: "get_spending_by_category" }],
        requireCausalGrounding: true,
      },
      answer: "Isso acontece porque gastos de moradia geralmente são altos.",
      toolCalls: [
        {
          ...julyTool,
          name: "get_spending_by_category",
          arguments: {},
          result: { categories: [{ category: "housing", amount: 1400 }] },
        },
      ],
    });

    expect(score.passed).toBe(false);
    expect(score.grounding).toBe(0);
  });
});
