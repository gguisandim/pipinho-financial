import { describe, expect, it } from "vitest";
import { FinancialAnalysisSchema } from "../src/llm/schemas/financial-analysis.schema.js";

describe("FinancialAnalysisSchema", () => {
  it("aceita uma resposta estruturada válida", () => {
    const result = FinancialAnalysisSchema.parse({
      status: "answered",
      answer: "O fluxo líquido do período foi positivo.",
      facts: [
        {
          type: "net_cash_flow",
          label: "Fluxo líquido",
          value: 2845.64,
          unit: "BRL",
        },
      ],
      missingData: [],
      confidence: 0.98,
    });

    expect(result.status).toBe("answered");
    expect(result.facts[0]?.value).toBe(2845.64);
  });

  it("aceita uma recusa estruturada por falta de dados", () => {
    const result = FinancialAnalysisSchema.parse({
      status: "insufficient_data",
      answer: "Não há dados de investimentos no resumo fornecido.",
      facts: [],
      missingData: ["investments"],
      confidence: 1,
    });

    expect(result.status).toBe("insufficient_data");
    expect(result.missingData).toEqual(["investments"]);
  });

  it("rejeita formato inválido em runtime", () => {
    expect(() =>
      FinancialAnalysisSchema.parse({
        status: "answered",
        answer: "Resposta inválida",
        facts: [],
        missingData: [],
        confidence: "alta",
      }),
    ).toThrow();
  });
});
