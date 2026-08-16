import { describe, expect, it } from "vitest";
import { syntheticTransactions } from "../src/fixtures/synthetic-transactions.js";
import { summarizeTransactions } from "../src/financial-engine/summarize.js";

describe("summarizeTransactions", () => {
  it("calcula métricas sem depender de LLM", () => {
    const summary = summarizeTransactions(syntheticTransactions);

    expect(summary.transactionCount).toBe(14);
    expect(summary.totalIncome).toBe(5650);
    expect(summary.totalExpenses).toBe(2804.36);
    expect(summary.netCashFlow).toBe(2845.64);
    expect(summary.savingsRatePct).toBe(50.37);
    expect(summary.expensesByCategory[0]).toEqual({
      category: "housing",
      amount: 1400,
    });
  });
});
