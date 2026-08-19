import { describe, expect, it } from "vitest";
import {
  evaluateFinancialEvidenceGrounding,
  sanitizeFinancialEvidenceGrounding,
} from "../src/agent/financial-evidence-grounding.js";
import type { AgentToolTrace } from "../src/agent/financial-agent.types.js";

function tool(name: string, result: unknown): AgentToolTrace {
  return {
    iteration: 1,
    id: `call-${name}`,
    name,
    arguments: {},
    outcome: "executed",
    result,
  };
}

const cashFlowTool = tool("get_cash_flow", {
  status: "ok",
  liquidity: {
    bankInflows: 4773.93,
    bankOutflows: 13167.96,
    netBankCashFlow: -8394.03,
  },
  income: {
    estimatedIncome: 186,
    classifiedIncomeShareOfBankInflowsPct: 3.9,
    quality: "insufficient",
  },
  spending: {
    bankSpending: 6185.3,
    cardPurchases: 7344.76,
    knownCardRefunds: 67.19,
    netSpending: 13462.87,
  },
  quality: {
    otherSpendingAmountPct: 35.25,
  },
});

describe("financial evidence grounding", () => {
  it("aceita valores monetários e percentuais presentes nas tools", () => {
    const answer =
      "O spending foi de R$ 13.462,87, com R$ 6.185,30 via BANK. A cobertura classificada de renda foi 3,9%.";

    expect(evaluateFinancialEvidenceGrounding(answer, [cashFlowTool])).toEqual({
      passed: true,
      violations: [],
    });
  });

  it("não aceita valor monetário só porque o mesmo número existe como contagem", () => {
    const answer = "Um gasto foi de R$ 3,00.";
    const evaluation = evaluateFinancialEvidenceGrounding(answer, [cashFlowTool]);
    expect(evaluation.passed).toBe(false);
    expect(
      evaluation.violations.some((item) => item.code === "unsupported_numeric_claim"),
    ).toBe(true);
  });

  it("detecta tabela de categorias inventada quando nenhuma tool de categoria foi executada", () => {
    const answer = `Resumo: R$ 13.462,87 de spending.

### Detalhes por categoria
| Categoria | Valor |
| Housing | R$ 1.200,00 |
| Groceries | R$ 1.500,00 |

### Observações
A renda continua insuficiente.`;

    const evaluation = evaluateFinancialEvidenceGrounding(answer, [cashFlowTool]);
    expect(evaluation.passed).toBe(false);
    expect(
      evaluation.violations.some(
        (item) => item.code === "unsupported_category_breakdown",
      ),
    ).toBe(true);
    expect(
      evaluation.violations.some(
        (item) => item.code === "unsupported_numeric_claim",
      ),
    ).toBe(true);

    const sanitized = sanitizeFinancialEvidenceGrounding(
      answer,
      [cashFlowTool],
      evaluation.violations,
    );
    expect(sanitized).not.toContain("Detalhes por categoria");
    expect(sanitized).not.toContain("1.200,00");
    expect(sanitized).toContain("13.462,87");
  });


  it("remove breakdown de categoria não sustentado mesmo quando o número coincide com outra métrica", () => {
    const answer = `Resumo geral válido: R$ 13.462,87.

| Housing | R$ 4.773,93 |

A análise geral permanece disponível.`;

    const evaluation = evaluateFinancialEvidenceGrounding(answer, [cashFlowTool]);
    expect(evaluation.passed).toBe(false);
    expect(
      evaluation.violations.some(
        (item) => item.code === "unsupported_category_breakdown",
      ),
    ).toBe(true);
    expect(
      evaluation.violations.some(
        (item) => item.code === "unsupported_numeric_claim",
      ),
    ).toBe(false);

    const sanitized = sanitizeFinancialEvidenceGrounding(
      answer,
      [cashFlowTool],
      evaluation.violations,
    );
    expect(sanitized).not.toContain("Housing");
    expect(sanitized).toContain("13.462,87");
    expect(evaluateFinancialEvidenceGrounding(sanitized, [cashFlowTool]).passed).toBe(true);
  });

  it("permite breakdown de categoria quando a tool correspondente foi executada", () => {
    const categoryTool = tool("get_spending_by_category", {
      status: "ok",
      categories: [
        { category: "groceries", amount: 1500 },
        { category: "financial_charges", amount: 250 },
      ],
    });

    const answer =
      "Groceries totalizou R$ 1.500,00 e encargos financeiros R$ 250,00.";
    expect(
      evaluateFinancialEvidenceGrounding(answer, [categoryTool]).passed,
    ).toBe(true);
  });
  it("aceita arredondamento de moeda quando a resposta omite centavos", () => {
    const result = evaluateFinancialEvidenceGrounding(
      "Em julho, o total gasto foi de R$ 1.235.",
      [tool("get_spending_summary", { spending: { netSpending: 1234.56 } })],
    );
    expect(result.passed).toBe(true);
  });

  it("continua rejeitando valor monetário arredondado para outro número", () => {
    const result = evaluateFinancialEvidenceGrounding(
      "Em julho, o total gasto foi de R$ 1.240.",
      [tool("get_spending_summary", { spending: { netSpending: 1234.56 } })],
    );
    expect(result.passed).toBe(false);
  });

  it("aceita total de um único mês vindo de spending_summary", () => {
    const result = evaluateFinancialEvidenceGrounding(
      "Em julho de 2026 você teve um net spending de R$ 816,37.",
      [
        tool("get_spending_summary", {
          status: "ok",
          period: { start: "2026-07-01", end: "2026-07-31" },
          spending: { netSpending: 816.37 },
        }),
      ],
    );

    expect(result).toEqual({ passed: true, violations: [] });
  });

  it("aceita categoria de um único mês sem exigir série mensal", () => {
    const result = evaluateFinancialEvidenceGrounding(
      "Em julho de 2026, você gastou R$ 245,52 em alimentação.",
      [
        tool("get_spending_by_category", {
          status: "ok",
          period: { start: "2026-07-01", end: "2026-07-31" },
          categoryGroup: "food",
          totalSpendingInReturnedCategories: 245.52,
          categories: [
            { category: "groceries", amount: 162.13 },
            { category: "restaurants", amount: 74.5 },
            { category: "food_delivery", amount: 8.89 },
          ],
        }),
      ],
    );

    expect(result).toEqual({ passed: true, violations: [] });
  });

  it("continua exigindo tool mensal para comparação entre dois meses", () => {
    const result = evaluateFinancialEvidenceGrounding(
      "Em julho gastei R$ 816,37 e em junho R$ 954,65.",
      [
        tool("get_spending_summary", {
          status: "ok",
          spending: { netSpending: 816.37 },
          otherEvidence: { previousMonth: 954.65 },
        }),
      ],
    );

    expect(result.passed).toBe(false);
    expect(
      result.violations.some((item) => item.code === "unsupported_monthly_breakdown"),
    ).toBe(true);
  });

});
