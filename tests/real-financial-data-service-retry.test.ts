import { describe, expect, it } from "vitest";
import type { TransactionRepository } from "../src/repositories/transaction.repository.js";
import { RealFinancialDataService } from "../src/services/real-financial-data.service.js";

const repository: TransactionRepository = {
  source: "pluggy",
  async listTransactions() {
    return {
      source: "pluggy",
      fetchedAt: "2026-08-18T00:00:00.000Z",
      transactions: [],
      diagnostics: {
        source: "pluggy",
        items: 3,
        accounts: 6,
        rawTransactions: 0,
        mappedTransactions: 0,
        skippedPending: 0,
        skippedInvalid: 0,
        truncatedAccounts: 0,
      },
    };
  },
};

describe("RealFinancialDataService snapshot", () => {
  it("não mantém Promise rejeitada em cache", async () => {
    let calls = 0;
    const flaky: TransactionRepository = {
      ...repository,
      async listTransactions() {
        calls += 1;
        if (calls === 1) throw new Error("network timeout");
        return repository.listTransactions();
      },
    };

    const service = new RealFinancialDataService(flaky);
    await expect(service.getFinancialPeriod()).rejects.toThrow("network timeout");
    await expect(service.getFinancialPeriod()).resolves.toMatchObject({ source: "pluggy" });
    expect(calls).toBe(2);
  });
});
