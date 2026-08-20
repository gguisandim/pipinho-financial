import { describe, expect, it } from "vitest";
import type { Transaction } from "../src/domain/finance.js";
import type { TransactionRepository } from "../src/repositories/transaction.repository.js";
import { RealFinancialDataService } from "../src/services/real-financial-data.service.js";
import { RealFinancialToolExecutor } from "../src/financial-tools/real-financial-tools.js";

const transactions: Transaction[] = [
  {
    id: "n1",
    date: "2026-08-01",
    description: "Compra",
    amount: 90,
    type: "debit",
    category: "shopping",
    metadata: {
      source: "pluggy",
      institution: "Nubank",
      accountType: "CREDIT",
      role: "card_purchase",
      status: "posted",
    },
  },
];

const repository: TransactionRepository = {
  source: "pluggy",
  async listTransactions() {
    return {
      source: "pluggy",
      fetchedAt: "2026-08-17T12:00:00Z",
      transactions,
      diagnostics: {
        source: "pluggy",
        rawTransactions: 1,
        mappedTransactions: 1,
        skippedPending: 0,
        skippedInvalid: 0,
      },
    };
  },
};

describe("RealFinancialToolExecutor", () => {
  it("executa tool assíncrona sobre repository real", async () => {
    const executor = new RealFinancialToolExecutor(
      new RealFinancialDataService(repository),
    );
    const result = (await executor.execute(
      "get_spending_by_institution",
      "{}",
    )) as { status: string; institutions: Array<{ institution: string }> };
    expect(result.status).toBe("ok");
    expect(result.institutions[0]?.institution).toBe("Nubank");
  });
});

describe("RealFinancialToolExecutor - Cycle 11 tools", () => {
  it("executa consulta de transações recentes", async () => {
    const executor = new RealFinancialToolExecutor(
      new RealFinancialDataService(repository),
    );
    const result = (await executor.execute(
      "get_recent_transactions",
      '{"kind":"spending","limit":1}',
    )) as { status: string; transactions: Array<{ description: string }> };
    expect(result.status).toBe("ok");
    expect(result.transactions[0]?.description).toBe("Compra");
  });

  it("exige query na busca textual", async () => {
    const executor = new RealFinancialToolExecutor(
      new RealFinancialDataService(repository),
    );
    await expect(executor.execute("search_transactions", "{}")).rejects.toThrow();
  });
});
