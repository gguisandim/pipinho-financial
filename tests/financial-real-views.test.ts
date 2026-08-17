import { describe, expect, it } from "vitest";
import type { Transaction } from "../src/domain/finance.js";
import { analyzeFinancialViews } from "../src/financial-engine/real-views.js";

function tx(
  partial: Partial<Transaction> & Pick<Transaction, "id" | "amount" | "type">,
): Transaction {
  return {
    date: "2026-08-10",
    description: "Teste",
    category: "other",
    ...partial,
  };
}

describe("Financial Engine real — cash flow x spending", () => {
  it("não duplica compra no cartão com pagamento da fatura", () => {
    const analysis = analyzeFinancialViews([
      tx({
        id: "card-purchase",
        amount: 100,
        type: "debit",
        description: "Mercado",
        category: "groceries",
        metadata: {
          source: "pluggy",
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
          accountType: "BANK",
          role: "bank_outflow",
          providerCategory: "Credit card payment",
          status: "posted",
        },
      }),
    ]);

    expect(analysis.spending.cardPurchases).toBe(100);
    expect(analysis.spending.bankSpending).toBe(0);
    expect(analysis.spending.netSpending).toBe(100);
    expect(analysis.liquidity.bankOutflows).toBe(100);
    expect(analysis.diagnostics.creditCardPaymentsExcludedFromSpending).toBe(1);
  });

  it("exclui transferência própria da liquidez consolidada, renda e spending", () => {
    const analysis = analyzeFinancialViews([
      tx({
        id: "own-out",
        amount: 500,
        type: "debit",
        description: "PIX mesma titularidade",
        metadata: {
          source: "pluggy",
          accountType: "BANK",
          role: "bank_outflow",
          providerCategory: "Same person transfer - PIX",
          status: "posted",
        },
      }),
      tx({
        id: "own-in",
        amount: 500,
        type: "credit",
        description: "PIX mesma titularidade",
        category: "income",
        metadata: {
          source: "pluggy",
          accountType: "BANK",
          role: "bank_inflow",
          providerCategory: "Same person transfer - PIX",
          categorySource: "direction_fallback",
          status: "posted",
        },
      }),
    ]);

    expect(analysis.liquidity.bankInflows).toBe(0);
    expect(analysis.liquidity.bankOutflows).toBe(0);
    expect(analysis.income.totalIncomeEstimate).toBe(0);
    expect(analysis.spending.netSpending).toBe(0);
    expect(analysis.diagnostics.internalTransfersExcluded).toBe(2);
  });

  it("subtrai estorno conhecido, mas não crédito de cartão sem semântica", () => {
    const analysis = analyzeFinancialViews([
      tx({
        id: "purchase",
        amount: 200,
        type: "debit",
        metadata: {
          source: "pluggy",
          accountType: "CREDIT",
          role: "card_purchase",
          status: "posted",
        },
      }),
      tx({
        id: "refund",
        amount: 50,
        type: "credit",
        description: "Estorno compra",
        metadata: {
          source: "pluggy",
          accountType: "CREDIT",
          role: "card_credit",
          status: "posted",
        },
      }),
      tx({
        id: "unknown-credit",
        amount: 30,
        type: "credit",
        description: "Crédito cartão",
        metadata: {
          source: "pluggy",
          accountType: "CREDIT",
          role: "card_credit",
          status: "posted",
        },
      }),
    ]);

    expect(analysis.spending.grossSpending).toBe(200);
    expect(analysis.spending.knownCardRefunds).toBe(50);
    expect(analysis.spending.netSpending).toBe(150);
    expect(analysis.diagnostics.cardRefundsApplied).toBe(1);
    expect(analysis.diagnostics.unclassifiedCardCredits).toBe(1);
  });

  it("separa receita confirmada de entrada inferida apenas pela direção", () => {
    const analysis = analyzeFinancialViews([
      tx({
        id: "salary",
        amount: 5000,
        type: "credit",
        category: "income",
        metadata: {
          source: "pluggy",
          accountType: "BANK",
          role: "bank_inflow",
          providerCategory: "Income - Salary",
          categorySource: "pluggy",
          status: "posted",
        },
      }),
      tx({
        id: "unknown-inflow",
        amount: 300,
        type: "credit",
        category: "income",
        metadata: {
          source: "pluggy",
          accountType: "BANK",
          role: "bank_inflow",
          categorySource: "direction_fallback",
          status: "posted",
        },
      }),
      tx({
        id: "expense",
        amount: 1000,
        type: "debit",
        category: "housing",
        metadata: {
          source: "pluggy",
          accountType: "BANK",
          role: "bank_outflow",
          status: "posted",
        },
      }),
    ]);

    expect(analysis.income.confirmedIncome).toBe(5000);
    expect(analysis.income.estimatedIncome).toBe(300);
    expect(analysis.income.totalIncomeEstimate).toBe(5300);
    expect(analysis.savings.estimatedSavings).toBe(4300);
    expect(analysis.savings.available).toBe(true);
    expect(analysis.income.quality).toBe("partial");
    expect(analysis.diagnostics.lowConfidenceIncomeTransactions).toBe(1);
  });

  it("não publica savings rate quando não há nenhuma renda confirmada", () => {
    const analysis = analyzeFinancialViews([
      tx({
        id: "unknown-inflow",
        amount: 100,
        type: "credit",
        category: "income",
        metadata: {
          source: "pluggy",
          accountType: "BANK",
          role: "bank_inflow",
          categorySource: "direction_fallback",
          status: "posted",
        },
      }),
      tx({
        id: "expense",
        amount: 1000,
        type: "debit",
        category: "shopping",
        metadata: {
          source: "pluggy",
          accountType: "BANK",
          role: "bank_outflow",
          status: "posted",
        },
      }),
    ]);

    expect(analysis.income.quality).toBe("insufficient");
    expect(analysis.savings.available).toBe(false);
    expect(analysis.savings.estimatedSavings).toBeNull();
    expect(analysis.savings.estimatedSavingsRatePct).toBeNull();
  });

  it("expõe BANK/CREDIT sem semântica como entrada não classificada", () => {
    const analysis = analyzeFinancialViews([
      tx({
        id: "unknown-credit",
        amount: 700,
        type: "credit",
        category: "other",
        metadata: {
          source: "pluggy",
          accountType: "BANK",
          role: "bank_inflow",
          categorySource: "fallback",
          status: "posted",
        },
      }),
    ]);

    expect(analysis.income.unclassifiedBankInflows).toBe(700);
    expect(analysis.income.unclassifiedBankInflowCount).toBe(1);
    expect(analysis.income.totalIncomeEstimate).toBe(0);
    expect(analysis.income.quality).toBe("insufficient");
  });

  it("não publica savings rate quando há renda confirmada mas a cobertura das entradas BANK é muito baixa", () => {
    const analysis = analyzeFinancialViews([
      tx({
        id: "tiny-confirmed-income",
        amount: 100,
        type: "credit",
        category: "income",
        metadata: {
          source: "pluggy",
          accountType: "BANK",
          role: "bank_inflow",
          providerCategory: "Income - Salary",
          categorySource: "pluggy",
          status: "posted",
        },
      }),
      tx({
        id: "large-unclassified-inflow",
        amount: 9900,
        type: "credit",
        category: "other",
        metadata: {
          source: "pluggy",
          accountType: "BANK",
          role: "bank_inflow",
          categorySource: "fallback",
          status: "posted",
        },
      }),
      tx({
        id: "expense",
        amount: 1000,
        type: "debit",
        category: "shopping",
        metadata: {
          source: "pluggy",
          accountType: "BANK",
          role: "bank_outflow",
          status: "posted",
        },
      }),
    ]);

    expect(analysis.income.confirmedIncome).toBe(100);
    expect(analysis.income.classifiedIncomeShareOfBankInflowsPct).toBe(1);
    expect(analysis.savings.available).toBe(false);
    expect(analysis.savings.estimatedSavings).toBeNull();
    expect(analysis.savings.estimatedSavingsRatePct).toBeNull();
    expect(analysis.savings.unavailableReason).toContain("coberta");
  });

});
