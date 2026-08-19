import { describe, expect, it } from "vitest";
import type { Transaction } from "../src/domain/finance.js";
import type {
  TransactionRepository,
  TransactionRepositorySnapshot,
} from "../src/repositories/transaction.repository.js";
import { DashboardDataService } from "../src/services/dashboard-data.service.js";
import { RealFinancialDataService } from "../src/services/real-financial-data.service.js";

const transactions: Transaction[] = [
  {
    id: "salary-jul",
    date: "2026-07-05",
    description: "Salário",
    amount: 3000,
    type: "credit",
    category: "income",
    metadata: {
      source: "pluggy",
      institution: "Nubank",
      role: "bank_inflow",
      status: "posted",
      categorySource: "pluggy",
      providerCategory: "Income - Salary",
    },
  },
  {
    id: "market-jul",
    date: "2026-07-10",
    description: "Mercado",
    amount: 200,
    type: "debit",
    category: "groceries",
    metadata: {
      source: "pluggy",
      institution: "Nubank",
      role: "card_purchase",
      status: "posted",
    },
  },
  {
    id: "salary-aug",
    date: "2026-08-05",
    description: "Salário",
    amount: 3000,
    type: "credit",
    category: "income",
    metadata: {
      source: "pluggy",
      institution: "Nubank",
      role: "bank_inflow",
      status: "posted",
      categorySource: "pluggy",
      providerCategory: "Income - Salary",
    },
  },
  {
    id: "uber-aug",
    date: "2026-08-06",
    description: "Uber",
    amount: 100,
    type: "debit",
    category: "transport",
    metadata: {
      source: "pluggy",
      institution: "PicPay",
      role: "bank_outflow",
      status: "posted",
    },
  },
  {
    id: "other-aug",
    date: "2026-08-07",
    description: "Taxa",
    amount: 50,
    type: "debit",
    category: "other",
    metadata: {
      source: "pluggy",
      institution: "Nubank",
      role: "bank_outflow",
      status: "posted",
    },
  },
  {
    id: "charge-aug",
    date: "2026-08-08",
    description: "Juros crédito rotativo",
    amount: 100,
    type: "debit",
    category: "financial_charges",
    metadata: {
      source: "pluggy",
      institution: "Nubank",
      role: "card_purchase",
      status: "posted",
      categorySource: "description_rule",
    },
  },
];

class MemoryRepository implements TransactionRepository {
  readonly source = "pluggy";
  async listTransactions(): Promise<TransactionRepositorySnapshot> {
    return {
      source: "pluggy",
      fetchedAt: "2026-08-18T05:00:00.000Z",
      transactions,
      diagnostics: {
        source: "pluggy",
        items: 2,
        accounts: 2,
        rawTransactions: transactions.length,
        mappedTransactions: transactions.length,
        skippedPending: 0,
        skippedInvalid: 0,
        truncatedAccounts: 0,
      },
    };
  }
}

function service() {
  return new DashboardDataService(
    new RealFinancialDataService(new MemoryRepository()),
  );
}

describe("DashboardDataService", () => {
  it("produz um contrato estável para cards, gráficos e qualidade", async () => {
    const result = await service().getOverview({ months: 12 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.schemaVersion).toBe("1.0");
    expect(result.dataset.availablePeriod).toEqual({
      start: "2026-07-05",
      end: "2026-08-08",
    });
    expect(result.monthly.status).toBe("ok");
    if (result.monthly.status === "ok") {
      expect(result.monthly.points.map((point) => point.month)).toEqual([
        "2026-07",
        "2026-08",
      ]);
    }
    expect(result.categories[0]?.sharePct).toBeGreaterThan(0);
    expect(result.institutions.some((item) => item.institution === "PicPay")).toBe(true);
    expect(result.privacy.rawTransactionsIncluded).toBe(false);
    expect(
      result.signals.some((signal) => signal.code === "high_financial_charges"),
    ).toBe(true);
    expect(result.quality.financialChargesAmount).toBe(100);
  });

  it("resolve metricRefs sem deixar o LLM fabricar o valor", async () => {
    const result = await service().getOverview();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const evidence = service().resolveMetric(result, "spending.netSpending");
    expect(evidence).toEqual({
      ref: "spending.netSpending",
      value: result.metrics.spending.netSpending,
      unit: "BRL",
    });
  });
});
