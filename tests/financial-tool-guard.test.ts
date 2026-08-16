import { describe, expect, it } from "vitest";
import { executeFinancialToolSafely } from "../src/agent/financial-tool-guard.js";

describe("financial tool grounding guard", () => {
  const referenceDate = "2026-08-16";

  it("rejeita datas inventadas quando a pergunta não informou período", () => {
    const result = executeFinancialToolSafely({
      question: "Analise meu fluxo financeiro",
      name: "get_cash_flow",
      rawArguments: JSON.stringify({
        startDate: "2023-01-01",
        endDate: "2023-12-31",
      }),
      referenceDate,
    });

    expect(result.status).toBe("rejected");
    expect((result.result as { code?: string }).code).toBe("ungrounded_date");
  });

  it("rejeita ano inventado para mês sem ano", () => {
    const result = executeFinancialToolSafely({
      question: "Quanto gastei em julho?",
      name: "get_cash_flow",
      rawArguments: JSON.stringify({
        startDate: "2023-07-01",
        endDate: "2023-07-31",
      }),
      referenceDate,
    });

    expect(result.status).toBe("rejected");
    expect((result.result as { code?: string }).code).toBe("implicit_year_mismatch");
  });

  it("aceita julho no ano de referência", () => {
    const result = executeFinancialToolSafely({
      question: "Quanto gastei em julho?",
      name: "get_cash_flow",
      rawArguments: JSON.stringify({
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      }),
      referenceDate,
    });

    expect(result.status).toBe("executed");
    expect((result.result as { status?: string }).status).toBe("no_data");
  });

  it("transforma argumentos fora do schema em feedback para o agente", () => {
    const result = executeFinancialToolSafely({
      question: "Quais dados estão disponíveis?",
      name: "get_data_capabilities",
      rawArguments: JSON.stringify({ entity: "all" }),
      referenceDate,
    });

    expect(result.status).toBe("rejected");
    expect((result.result as { code?: string }).code).toBe("invalid_arguments");
  });
});
