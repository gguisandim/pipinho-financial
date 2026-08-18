import { describe, expect, it } from "vitest";
import { evaluateFinancialQualityGrounding } from "../src/agent/financial-quality-grounding.js";
import type { AgentToolTrace } from "../src/agent/financial-agent.types.js";

const tools: AgentToolTrace[] = [
  {
    iteration: 1,
    id: "cash",
    name: "get_cash_flow",
    arguments: {},
    outcome: "executed",
    result: {
      status: "ok",
      income: { quality: "insufficient", confirmedIncome: 0 },
      savings: {
        available: false,
        estimatedSavings: null,
        estimatedSavingsRatePct: null,
        unavailableReason: "renda insuficientemente identificada",
      },
    },
  },
];

describe("financial quality grounding", () => {
  it("rejeita savings rate numérico quando backend marcou indisponível", () => {
    const evaluation = evaluateFinancialQualityGrounding(
      "Sua taxa de poupança é 42%.",
      tools,
    );
    expect(evaluation.passed).toBe(false);
    expect(evaluation.violations[0]?.code).toBe("unavailable_savings_claim");
  });

  it("aceita explicação explícita de indisponibilidade", () => {
    const evaluation = evaluateFinancialQualityGrounding(
      "Não é possível calcular sua taxa de poupança porque a renda está insuficientemente identificada.",
      tools,
    );
    expect(evaluation.passed).toBe(true);
  });
});
