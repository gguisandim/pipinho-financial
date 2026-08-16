import { describe, expect, it } from "vitest";
import { executeFinancialTool } from "../src/financial-tools/financial-tools.js";

describe("executeFinancialTool", () => {
  it("valida e executa get_cash_flow", () => {
    const result = executeFinancialTool("get_cash_flow", "{}") as {
      status: string;
      netCashFlow?: number;
    };

    expect(result.status).toBe("ok");
    expect(result.netCashFlow).toBe(2845.64);
  });

  it("rejeita data em formato inválido", () => {
    expect(() =>
      executeFinancialTool(
        "get_cash_flow",
        JSON.stringify({ startDate: "01/08/2026" }),
      ),
    ).toThrow();
  });

  it("rejeita tool desconhecida", () => {
    expect(() => executeFinancialTool("drop_database", "{}"))
      .toThrow(/Tool financeira desconhecida/);
  });
});
