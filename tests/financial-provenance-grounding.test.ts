import { describe, expect, it } from "vitest";
import { evaluateFinancialProvenanceGrounding, sanitizeFinancialProvenanceGrounding } from "../src/agent/financial-provenance-grounding.js";
import type { AgentToolTrace } from "../src/agent/financial-agent.types.js";

function tool(name: string): AgentToolTrace {
  return {
    iteration: 1,
    id: name,
    name,
    arguments: {},
    outcome: "executed",
    result: { status: "ok" },
  };
}

describe("financial provenance grounding", () => {
  it("bloqueia atribuição da anti-dupla-contagem à Pluggy", () => {
    const result = evaluateFinancialProvenanceGrounding(
      "O Pluggy já removeu a dupla contagem entre compra e pagamento da fatura.",
      [tool("get_cash_flow")],
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.code).toBe("wrong_double_count_attribution");
  });

  it("não aceita dizer que agregação por categoria é amostra sem tool de composição", () => {
    const result = evaluateFinancialProvenanceGrounding(
      "Os dados por categoria são apenas uma amostra e não representam todas as transações.",
      [tool("get_spending_by_category")],
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.code).toBe("unsupported_category_sample_claim");
  });

  it("bloqueia exposição de nome interno de tool", () => {
    const result = evaluateFinancialProvenanceGrounding(
      "Use get_income para revisar sua renda.",
      [tool("get_income")],
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.code).toBe("internal_tool_name_exposure");
  });
});


it("corrige violações simples de proveniência sem nova chamada de LLM", () => {
  const answer = "O Pluggy já removeu a dupla contagem entre compra e fatura. Use get_income para revisar a renda.";
  const tools = [tool("get_cash_flow"), tool("get_income")];
  const evaluation = evaluateFinancialProvenanceGrounding(answer, tools);
  const sanitized = sanitizeFinancialProvenanceGrounding(answer, evaluation.violations);
  const finalEvaluation = evaluateFinancialProvenanceGrounding(sanitized, tools);
  expect(finalEvaluation.passed).toBe(true);
  expect(sanitized).toContain("backend");
  expect(sanitized).not.toContain("get_income");
});
