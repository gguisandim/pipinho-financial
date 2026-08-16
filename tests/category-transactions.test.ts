import { describe, expect, it } from "vitest";
import { executeFinancialTool } from "../src/financial-tools/financial-tools.js";

describe("get_category_transactions", () => {
  it("retorna composição observada de housing sem afirmar causa comportamental", () => {
    const result = executeFinancialTool(
      "get_category_transactions",
      JSON.stringify({ category: "housing" }),
    ) as {
      status: string;
      total: number;
      transactions: Array<{ description: string; amount: number }>;
      evidenceScope: { supportsBehavioralCause: boolean };
    };

    expect(result.status).toBe("ok");
    expect(result.total).toBe(1400);
    expect(result.transactions[0]).toMatchObject({ description: "Aluguel", amount: 1400 });
    expect(result.evidenceScope.supportsBehavioralCause).toBe(false);
  });
});
