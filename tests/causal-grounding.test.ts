import { describe, expect, it } from "vitest";
import {
  evaluateCausalGrounding,
  sanitizeCausalGrounding,
} from "../src/agent/causal-grounding.js";
import type { AgentToolTrace } from "../src/agent/financial-agent.types.js";

function tool(result: unknown): AgentToolTrace {
  return {
    iteration: 1,
    id: "tool-1",
    name: "get_spending_by_category",
    arguments: {},
    outcome: "executed",
    result,
  };
}

describe("causal grounding", () => {
  it("detecta generalização e detalhes não presentes na evidência", () => {
    const tools = [
      tool({
        status: "ok",
        categories: [{ category: "housing", amount: 1400 }],
      }),
    ];

    const answer =
      "Habitação foi a maior categoria com R$ 1.400. Isso ocorre porque custos de moradia costumam incluir aluguel, condomínio e manutenção.";

    const result = evaluateCausalGrounding(answer, tools);
    expect(result.passed).toBe(false);
    expect(result.violations.some((item) => item.code === "unsupported_generalization")).toBe(true);
    expect(result.violations.some((item) => item.code === "unsupported_detail")).toBe(true);

    const sanitized = sanitizeCausalGrounding(answer, result.violations);
    expect(sanitized).not.toContain("costumam");
    expect(sanitized).toContain("não permitem atribuir causas comportamentais");
  });

  it("permite detalhe que veio explicitamente de uma tool", () => {
    const tools = [
      tool({
        status: "ok",
        category: "housing",
        transactions: [{ description: "Aluguel", amount: 1400 }],
      }),
    ];

    const result = evaluateCausalGrounding(
      "A categoria housing é composta por uma transação de Aluguel de R$ 1.400.",
      tools,
    );

    expect(result.passed).toBe(true);
  });
});
