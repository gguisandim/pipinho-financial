import { describe, expect, it } from "vitest";
import type { Transaction } from "../src/domain/finance.js";
import type {
  TransactionRepository,
  TransactionRepositorySnapshot,
} from "../src/repositories/transaction.repository.js";
import { RealFinancialDataService } from "../src/services/real-financial-data.service.js";

function tx(partial: Partial<Transaction> & Pick<Transaction, "id" | "amount" | "type">): Transaction {
  return {
    date: "2026-08-10",
    description: "Teste",
    category: "other",
    ...partial,
  };
}

class MemoryRepository implements TransactionRepository {
  readonly source = "pluggy";
  constructor(private readonly transactions: Transaction[]) {}
  async listTransactions(): Promise<TransactionRepositorySnapshot> {
    return {
      source: this.source,
      fetchedAt: "2026-08-17T12:00:00.000Z",
      transactions: this.transactions,
      diagnostics: {
        source: this.source,
        rawTransactions: this.transactions.length,
        mappedTransactions: this.transactions.length,
        skippedPending: 0,
        skippedInvalid: 0,
        truncatedAccounts: 0,
      },
    };
  }
}

function service() {
  return new RealFinancialDataService(
    new MemoryRepository([
      tx({
        id: "salary",
        amount: 5000,
        type: "credit",
        category: "income",
        description: "Salário",
        metadata: {
          source: "pluggy",
          institution: "Nubank",
          accountType: "BANK",
          role: "bank_inflow",
          categorySource: "pluggy",
          providerCategory: "Income - Salary",
          status: "posted",
        },
      }),
      tx({
        id: "card-purchase",
        amount: 100,
        type: "debit",
        category: "groceries",
        description: "Mercado",
        metadata: {
          source: "pluggy",
          institution: "Nubank",
          accountName: "gold",
          accountType: "CREDIT",
          role: "card_purchase",
          status: "posted",
        },
      }),
      tx({
        id: "bill-payment",
        amount: 100,
        type: "debit",
        description: "Pagamento de fatura",
        metadata: {
          source: "pluggy",
          institution: "Nubank",
          accountType: "BANK",
          role: "bank_outflow",
          providerCategory: "Credit card payment",
          status: "posted",
        },
      }),
      tx({
        id: "picpay",
        amount: 50,
        type: "debit",
        category: "transport",
        description: "Uber",
        metadata: {
          source: "pluggy",
          institution: "PicPay",
          accountType: "BANK",
          role: "bank_outflow",
          status: "posted",
        },
      }),
    ]),
  );
}

describe("RealFinancialDataService", () => {
  it("mantém spending sem dupla contagem no resultado para o agente", async () => {
    const result = await service().getCashFlow();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.spending.netSpending).toBe(150);
    expect(result.liquidity.bankOutflows).toBe(150);
    expect(result.savings.available).toBe(true);
    expect(result.evidenceScope.rawTransactionsSentToLlm).toBe(false);
  });

  it("expõe uma tool de spending enxuta sem breakdown de categoria", async () => {
    const result = await service().getSpendingSummary();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.spending.netSpending).toBe(150);
    expect(result.evidenceScope.categoryBreakdownIncluded).toBe(false);
    expect("income" in result).toBe(false);
  });

  it("expõe savings por contrato dedicado", async () => {
    const result = await service().getSavingsStatus();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.savings.available).toBe(true);
    expect(result.income.quality).toBe("reliable");
    expect(result.evidenceScope.savingsMustRespectAvailableFlag).toBe(true);
  });

  it("compara spending por instituição", async () => {
    const result = await service().getSpendingByInstitution();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.institutions).toEqual([
      { institution: "Nubank", amount: 100, transactionCount: 1 },
      { institution: "PicPay", amount: 50, transactionCount: 1 },
    ]);
  });

  it("agrega alimentação no backend sem delegar soma ao LLM", async () => {
    const foodService = new RealFinancialDataService(
      new MemoryRepository([
        tx({
          id: "food-grocery",
          amount: 30,
          type: "debit",
          category: "groceries",
          metadata: { source: "pluggy", institution: "Nubank", accountType: "BANK", role: "bank_outflow", status: "posted" },
        }),
        tx({
          id: "food-delivery",
          amount: 20,
          type: "debit",
          category: "food_delivery",
          metadata: { source: "pluggy", institution: "Nubank", accountType: "CREDIT", role: "card_purchase", status: "posted" },
        }),
        tx({
          id: "food-restaurant",
          amount: 10,
          type: "debit",
          category: "restaurants",
          metadata: { source: "pluggy", institution: "PicPay", accountType: "BANK", role: "bank_outflow", status: "posted" },
        }),
      ]),
    );

    const result = await foodService.getSpendingByCategory({ categoryGroup: "food" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.categoryGroup).toBe("food");
    expect(result.totalSpendingInReturnedCategories).toBe(60);
    expect(result.categories.map((entry) => entry.category).sort()).toEqual([
      "food_delivery",
      "groceries",
      "restaurants",
    ]);
  });

  it("limita transações detalhadas retornadas ao LLM", async () => {
    const result = await service().getCategoryTransactions({
      category: "groceries",
      limit: 1,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.returnedTransactionCount).toBe(1);
    expect(result.transactions[0]?.description).toBe("Mercado");
  });
});

describe("RealFinancialDataService - Cycle 11 conversational tools", () => {
  it("retorna o gasto mais recente sem incluir pagamento de fatura", async () => {
    const result = await service().getRecentTransactions({ kind: "spending", limit: 1 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.ambiguousLatestDate).toBe(true);
    expect(result.latestDateCandidateCount).toBe(2);
    expect(result.transactions.map((item) => item.description).sort()).toEqual([
      "Mercado",
      "Uber",
    ]);
    expect(result.transactions.map((item) => item.description)).not.toContain("Pagamento de fatura");
  });

  it("busca movimentações por descrição de forma tolerante a caixa", async () => {
    const result = await service().searchTransactions({ query: "uber", kind: "spending" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.transactions[0]?.description).toBe("Uber");
    expect(result.transactions[0]?.institution).toBe("PicPay");
  });

  it("calcula média diária no backend", async () => {
    const result = await service().getDailySpendingSummary();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.totalSpending).toBe(150);
    expect(result.averagePerCalendarDay).toBe(150);
    expect(result.averagePerSpendingDay).toBe(150);
  });
});
