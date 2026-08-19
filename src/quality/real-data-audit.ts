import type { TransactionRepositorySnapshot } from "../repositories/transaction.repository.js";
import {
  analyzeFinancialViews,
  classifyFinancialMovement,
} from "../financial-engine/real-views.js";

export type AuditStatus = "pass" | "warn" | "fail";

export interface AuditCheck {
  id: string;
  status: AuditStatus;
  message: string;
  details?: unknown;
}

function closeEnough(a: number, b: number, epsilon = 0.02): boolean {
  return Math.abs(a - b) <= epsilon;
}

export function auditRealSnapshot(snapshot: TransactionRepositorySnapshot): {
  checks: AuditCheck[];
  summary: { pass: number; warn: number; fail: number };
} {
  const checks: AuditCheck[] = [];
  const transactions = snapshot.transactions;

  checks.push({
    id: "has-transactions",
    status: transactions.length > 0 ? "pass" : "fail",
    message:
      transactions.length > 0
        ? `${transactions.length} transações canônicas disponíveis.`
        : "Nenhuma transação canônica disponível.",
  });

  if (transactions.length === 0) {
    return {
      checks,
      summary: { pass: 0, warn: 0, fail: 1 },
    };
  }

  const uniqueIds = new Set(transactions.map((tx) => tx.id));
  checks.push({
    id: "unique-ids",
    status: uniqueIds.size === transactions.length ? "pass" : "fail",
    message:
      uniqueIds.size === transactions.length
        ? "IDs canônicos são únicos."
        : `Foram encontrados ${transactions.length - uniqueIds.size} IDs duplicados.`,
  });

  const invalidAmounts = transactions.filter(
    (tx) => !Number.isFinite(tx.amount) || tx.amount < 0,
  );
  checks.push({
    id: "valid-amounts",
    status: invalidAmounts.length === 0 ? "pass" : "fail",
    message:
      invalidAmounts.length === 0
        ? "Todos os amounts canônicos são finitos e não negativos."
        : `${invalidAmounts.length} transações possuem amount inválido.`,
  });

  const pending = transactions.filter((tx) => tx.metadata?.status === "pending");
  checks.push({
    id: "pending-excluded",
    status: pending.length === 0 ? "pass" : "fail",
    message:
      pending.length === 0
        ? "Nenhuma transação PENDING entrou na análise histórica."
        : `${pending.length} transações PENDING vazaram para o snapshot histórico.`,
  });

  const invalidDates = transactions.filter(
    (tx) => !/^\d{4}-\d{2}-\d{2}$/.test(tx.date),
  );
  checks.push({
    id: "canonical-dates",
    status: invalidDates.length === 0 ? "pass" : "fail",
    message:
      invalidDates.length === 0
        ? "Todas as datas estão em YYYY-MM-DD."
        : `${invalidDates.length} datas canônicas são inválidas.`,
  });

  const truncated = snapshot.diagnostics.truncatedAccounts ?? 0;
  checks.push({
    id: "pagination-complete",
    status: truncated === 0 ? "pass" : "fail",
    message:
      truncated === 0
        ? "Nenhuma Account foi truncada pela paginação local."
        : `${truncated} Accounts foram truncadas; agregações podem estar incompletas.`,
  });

  const analysis = analyzeFinancialViews(transactions);

  checks.push({
    id: "liquidity-identity",
    status: closeEnough(
      analysis.liquidity.bankInflows - analysis.liquidity.bankOutflows,
      analysis.liquidity.netBankCashFlow,
    )
      ? "pass"
      : "fail",
    message: "Identidade de liquidez: inflows - outflows = net cash flow.",
  });

  checks.push({
    id: "spending-gross-identity",
    status: closeEnough(
      analysis.spending.bankSpending + analysis.spending.cardPurchases,
      analysis.spending.grossSpending,
    )
      ? "pass"
      : "fail",
    message: "Identidade de spending bruto: BANK + cartão = gross spending.",
  });

  checks.push({
    id: "spending-net-identity",
    status: closeEnough(
      analysis.spending.grossSpending - analysis.spending.knownCardRefunds,
      analysis.spending.netSpending,
    )
      ? "pass"
      : "fail",
    message: "Identidade de spending líquido: gross - refunds = net spending.",
  });

  const categorySum = analysis.spending.expensesByCategory.reduce(
    (sum, entry) => sum + entry.amount,
    0,
  );
  checks.push({
    id: "category-total-identity",
    status: closeEnough(categorySum, analysis.spending.grossSpending) ? "pass" : "fail",
    message:
      "A soma das categorias deve corresponder ao spending bruto antes de refunds não alocados.",
    details: { categorySum, grossSpending: analysis.spending.grossSpending },
  });

  if (analysis.income.quality === "insufficient") {
    checks.push({
      id: "savings-quality-guard",
      status: analysis.savings.available ? "fail" : "pass",
      message: analysis.savings.available
        ? "Savings foi disponibilizado apesar de income.quality=insufficient."
        : "Savings permanece indisponível quando a renda é insuficiente.",
    });
  } else {
    checks.push({
      id: "savings-quality-guard",
      status: "pass",
      message: "Qualidade de renda permite avaliar a regra de savings normalmente.",
    });
  }

  const internalTransfers = transactions.filter(
    (tx) => classifyFinancialMovement(tx) === "internal_transfer",
  );
  const billPayments = transactions.filter(
    (tx) => classifyFinancialMovement(tx) === "credit_card_payment",
  );
  checks.push({
    id: "anti-double-count-diagnostics",
    status:
      analysis.diagnostics.internalTransfersExcluded === internalTransfers.length &&
      analysis.diagnostics.creditCardPaymentsExcludedFromSpending === billPayments.length
        ? "pass"
        : "fail",
    message: "Diagnósticos de transferência/fatura batem com a classificação determinística.",
  });

  const missingInstitution = transactions.filter(
    (tx) => !tx.metadata?.institution,
  ).length;
  const missingInstitutionPct = (missingInstitution / transactions.length) * 100;
  checks.push({
    id: "institution-coverage",
    status: missingInstitutionPct <= 1 ? "pass" : missingInstitutionPct <= 10 ? "warn" : "fail",
    message: `${missingInstitutionPct.toFixed(2)}% das transações estão sem instituição mapeada.`,
  });

  checks.push({
    id: "category-coverage",
    status:
      analysis.diagnostics.otherSpendingAmountPct < 30
        ? "pass"
        : analysis.diagnostics.otherSpendingAmountPct < 60
          ? "warn"
          : "fail",
    message:
      `${analysis.diagnostics.otherSpendingAmountPct.toFixed(2)}% do valor de spending está em other ` +
      `(${analysis.diagnostics.otherSpendingTransactionPct.toFixed(2)}% das transações de gasto).`,
    details: {
      otherSpendingTransactions: analysis.diagnostics.otherSpendingTransactions,
      otherSpendingAmount: analysis.diagnostics.otherSpendingAmount,
      otherSpendingTransactionPct: analysis.diagnostics.otherSpendingTransactionPct,
      otherSpendingAmountPct: analysis.diagnostics.otherSpendingAmountPct,
    },
  });

  const financeChargePattern =
    /(juros|iof|multa(?:\s+por)?\s+atraso|multa\s+de\s+atraso|saldo\s+em\s+atraso|credito\s+rotativo|d[ií]vida\s+encerrada)/i;
  const financialChargeLikeOther = transactions.filter(
    (tx) =>
      tx.category === "other" &&
      classifyFinancialMovement(tx) === "spending" &&
      financeChargePattern.test(tx.description),
  );
  checks.push({
    id: "taxonomy-financial-charges",
    status: financialChargeLikeOther.length === 0 ? "pass" : "warn",
    message:
      financialChargeLikeOther.length === 0
        ? `Encargos financeiros possuem categoria própria; ${analysis.diagnostics.financialChargesTransactions} transações foram classificadas nela.`
        : `${financialChargeLikeOther.length} gastos em other ainda parecem juros/IOF/multa e precisam de regra adicional.`,
    details: {
      classifiedTransactions: analysis.diagnostics.financialChargesTransactions,
      classifiedAmount: analysis.diagnostics.financialChargesAmount,
      classifiedAmountPct: analysis.diagnostics.financialChargesPct,
      remainingChargeLikeOther: financialChargeLikeOther.length,
    },
  });

  checks.push({
    id: "income-coverage",
    status:
      analysis.income.quality === "reliable"
        ? "pass"
        : analysis.income.quality === "partial"
          ? "warn"
          : "warn",
    message: `Qualidade de renda: ${analysis.income.quality}; cobertura classificada: ${analysis.income.classifiedIncomeShareOfBankInflowsPct ?? 0}%.`,
  });

  const summary = checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 } as { pass: number; warn: number; fail: number },
  );

  return { checks, summary };
}
