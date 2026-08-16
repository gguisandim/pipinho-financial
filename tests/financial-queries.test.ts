import { describe, expect, it } from "vitest";
import { syntheticTransactions } from "../src/fixtures/synthetic-transactions.js";
import {
  getFinancialDataCapabilities,
  queryCashFlow,
  querySpendingByCategory,
} from "../src/financial-engine/queries.js";


describe("financial queries para tools", () => {
  it("retorna no_data para julho", () => {
    const result = queryCashFlow(syntheticTransactions, {
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });

    expect(result.status).toBe("no_data");
  });

  it("retorna housing como maior categoria", () => {
    const result = querySpendingByCategory(syntheticTransactions);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.categories[0]).toEqual({
      category: "housing",
      amount: 1400,
    });
  });

  it("explicita que instituição e investimentos não existem no dataset", () => {
    const result = getFinancialDataCapabilities();

    expect(result.unavailableInCurrentDataset).toContain("financial_institution");
    expect(result.unavailableInCurrentDataset).toContain("investments");
  });
});

describe("no_data com cobertura temporal", () => {
  it("inclui availablePeriod para evitar uma segunda tool desnecessária", () => {
    const result = queryCashFlow(syntheticTransactions, {
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });

    expect(result.status).toBe("no_data");
    if (result.status === "no_data") {
      expect(result.availablePeriod).toMatchObject({
        status: "ok",
        start: "2026-08-01",
        end: "2026-08-14",
      });
    }
  });
});
