import { describe, expect, it } from "vitest";
import type { TransactionRepositorySnapshot } from "../src/repositories/transaction.repository.js";
import { auditRealSnapshot } from "../src/quality/real-data-audit.js";

function snapshot(): TransactionRepositorySnapshot {
  return {
    source: "pluggy",
    fetchedAt: "2026-08-18T05:00:00.000Z",
    transactions: [
      {
        id: "income",
        date: "2026-08-01",
        description: "Salário",
        amount: 1000,
        type: "credit",
        category: "income",
        metadata: {
          source: "pluggy",
          institution: "Nubank",
          role: "bank_inflow",
          status: "posted",
          categorySource: "pluggy",
        },
      },
      {
        id: "purchase",
        date: "2026-08-02",
        description: "Mercado",
        amount: 100,
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
        id: "bill",
        date: "2026-08-03",
        description: "Pagamento de fatura",
        amount: 100,
        type: "debit",
        category: "other",
        metadata: {
          source: "pluggy",
          institution: "Nubank",
          role: "bank_outflow",
          status: "posted",
          providerCategory: "Credit card payment",
        },
      },
    ],
    diagnostics: {
      source: "pluggy",
      rawTransactions: 3,
      mappedTransactions: 3,
      skippedPending: 0,
      skippedInvalid: 0,
      truncatedAccounts: 0,
    },
  };
}

describe("auditRealSnapshot", () => {
  it("valida invariantes contábeis e anti-dupla-contagem", () => {
    const result = auditRealSnapshot(snapshot());
    expect(result.summary.fail).toBe(0);
    expect(result.checks.find((check) => check.id === "spending-net-identity")?.status).toBe("pass");
    expect(result.checks.find((check) => check.id === "anti-double-count-diagnostics")?.status).toBe("pass");
  });

  it("mede cobertura de categoria pelo valor e não apenas pela quantidade", () => {
    const base = snapshot();
    base.transactions = [
      {
        id: "other-large",
        date: "2026-08-01",
        description: "Despesa não classificada",
        amount: 1000,
        type: "debit",
        category: "other",
        metadata: {
          source: "pluggy",
          institution: "Nubank",
          role: "card_purchase",
          status: "posted",
        },
      },
      ...Array.from({ length: 9 }, (_, index) => ({
        id: `known-${index}`,
        date: "2026-08-02",
        description: "Mercado",
        amount: 1,
        type: "debit" as const,
        category: "groceries" as const,
        metadata: {
          source: "pluggy" as const,
          institution: "Nubank",
          role: "card_purchase" as const,
          status: "posted" as const,
        },
      })),
    ];
    base.diagnostics.rawTransactions = base.transactions.length;
    base.diagnostics.mappedTransactions = base.transactions.length;

    const result = auditRealSnapshot(base);
    const coverage = result.checks.find((check) => check.id === "category-coverage");
    expect(coverage?.status).toBe("fail");
    expect(coverage?.message).toContain("do valor de spending");
  });

  it("falha para IDs duplicados e PENDING vazando no histórico", () => {
    const bad = snapshot();
    bad.transactions.push({
      ...bad.transactions[0]!,
      metadata: { ...bad.transactions[0]!.metadata!, status: "pending" },
    });
    const result = auditRealSnapshot(bad);
    expect(result.checks.find((check) => check.id === "unique-ids")?.status).toBe("fail");
    expect(result.checks.find((check) => check.id === "pending-excluded")?.status).toBe("fail");
  });
});
