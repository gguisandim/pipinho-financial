import type {
  Transaction,
  TransactionCategory,
} from "../domain/finance.js";
import { summarizeTransactions } from "./summarize.js";

export interface DateRange {
  startDate?: string;
  endDate?: string;
}

function inRange(transaction: Transaction, range: DateRange): boolean {
  if (range.startDate && transaction.date < range.startDate) return false;
  if (range.endDate && transaction.date > range.endDate) return false;
  return true;
}

export function filterTransactions(
  transactions: Transaction[],
  range: DateRange = {},
): Transaction[] {
  return transactions.filter((transaction) => inRange(transaction, range));
}

export function getAvailablePeriod(transactions: Transaction[]) {
  if (transactions.length === 0) {
    return {
      status: "no_data" as const,
      start: null,
      end: null,
      transactionCount: 0,
    };
  }

  const ordered = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

  return {
    status: "ok" as const,
    start: ordered[0].date,
    end: ordered[ordered.length - 1].date,
    transactionCount: transactions.length,
  };
}

export function queryCashFlow(
  transactions: Transaction[],
  range: DateRange = {},
) {
  const selected = filterTransactions(transactions, range);

  if (selected.length === 0) {
    return {
      status: "no_data" as const,
      requestedPeriod: range,
      availablePeriod: getAvailablePeriod(transactions),
      message: "Não existem transações no período solicitado.",
    };
  }

  const summary = summarizeTransactions(selected);

  return {
    status: "ok" as const,
    period: summary.period,
    transactionCount: summary.transactionCount,
    totalIncome: summary.totalIncome,
    totalExpenses: summary.totalExpenses,
    netCashFlow: summary.netCashFlow,
    savingsRatePct: summary.savingsRatePct,
  };
}

export function queryIncome(
  transactions: Transaction[],
  range: DateRange = {},
) {
  const selected = filterTransactions(transactions, range).filter(
    (transaction) => transaction.type === "credit",
  );

  if (selected.length === 0) {
    return {
      status: "no_data" as const,
      requestedPeriod: range,
      availablePeriod: getAvailablePeriod(transactions),
      message: "Não existem receitas no período solicitado.",
    };
  }

  const totalIncome = selected.reduce((sum, transaction) => sum + transaction.amount, 0);

  return {
    status: "ok" as const,
    requestedPeriod: range,
    totalIncome: Math.round((totalIncome + Number.EPSILON) * 100) / 100,
    incomeTransactionCount: selected.length,
  };
}

export function querySpendingByCategory(
  transactions: Transaction[],
  options: DateRange & { category?: TransactionCategory } = {},
) {
  const selected = filterTransactions(transactions, options).filter(
    (transaction) =>
      transaction.type === "debit" &&
      (!options.category || transaction.category === options.category),
  );

  if (selected.length === 0) {
    return {
      status: "no_data" as const,
      requestedPeriod: {
        startDate: options.startDate,
        endDate: options.endDate,
      },
      category: options.category ?? null,
      availablePeriod: getAvailablePeriod(transactions),
      message: options.category
        ? `Não existem despesas na categoria ${options.category} para o período solicitado.`
        : "Não existem despesas no período solicitado.",
    };
  }

  const totals = new Map<TransactionCategory, number>();

  for (const transaction of selected) {
    totals.set(
      transaction.category,
      (totals.get(transaction.category) ?? 0) + transaction.amount,
    );
  }

  const categories = [...totals.entries()]
    .map(([category, amount]) => ({
      category,
      amount: Math.round((amount + Number.EPSILON) * 100) / 100,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    status: "ok" as const,
    requestedPeriod: {
      startDate: options.startDate,
      endDate: options.endDate,
    },
    category: options.category ?? null,
    totalExpenses: Math.round(
      (selected.reduce((sum, transaction) => sum + transaction.amount, 0) +
        Number.EPSILON) *
        100,
    ) / 100,
    categories,
    evidenceScope: {
      supportsQuantitativeComparison: true,
      supportsBehavioralCause: false,
      compositionTool: "get_category_transactions",
    },
  };
}


export function queryCategoryTransactions(
  transactions: Transaction[],
  options: DateRange & { category: TransactionCategory },
) {
  const selected = filterTransactions(transactions, options)
    .filter(
      (transaction) =>
        transaction.type === "debit" && transaction.category === options.category,
    )
    .sort((a, b) => b.amount - a.amount);

  if (selected.length === 0) {
    return {
      status: "no_data" as const,
      requestedPeriod: {
        startDate: options.startDate,
        endDate: options.endDate,
      },
      category: options.category,
      availablePeriod: getAvailablePeriod(transactions),
      message: `Não existem transações na categoria ${options.category} para o período solicitado.`,
    };
  }

  const total = selected.reduce((sum, transaction) => sum + transaction.amount, 0);

  return {
    status: "ok" as const,
    requestedPeriod: {
      startDate: options.startDate,
      endDate: options.endDate,
    },
    category: options.category,
    total: Math.round((total + Number.EPSILON) * 100) / 100,
    transactions: selected.map((transaction) => ({
      date: transaction.date,
      description: transaction.description,
      amount: transaction.amount,
    })),
    evidenceScope: {
      supportsCompositionExplanation: true,
      supportsBehavioralCause: false,
      note: "As descrições explicam a composição observada da categoria, não o motivo comportamental do gasto.",
    },
  };
}

export function queryLargestExpenses(
  transactions: Transaction[],
  options: DateRange & { limit?: number } = {},
) {
  const limit = options.limit ?? 5;
  const selected = filterTransactions(transactions, options)
    .filter((transaction) => transaction.type === "debit")
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);

  if (selected.length === 0) {
    return {
      status: "no_data" as const,
      requestedPeriod: {
        startDate: options.startDate,
        endDate: options.endDate,
      },
      availablePeriod: getAvailablePeriod(transactions),
      message: "Não existem despesas no período solicitado.",
    };
  }

  return {
    status: "ok" as const,
    requestedPeriod: {
      startDate: options.startDate,
      endDate: options.endDate,
    },
    expenses: selected.map((transaction) => ({
      date: transaction.date,
      description: transaction.description,
      category: transaction.category,
      amount: transaction.amount,
    })),
  };
}

export function getFinancialDataCapabilities() {
  return {
    status: "ok" as const,
    source: "synthetic_transactions",
    availableTransactionFields: [
      "date",
      "description",
      "amount",
      "type",
      "category",
    ],
    supportedAnalyses: [
      "available_period",
      "income",
      "expenses",
      "cash_flow",
      "savings_rate",
      "expenses_by_category",
      "category_transactions",
      "largest_expenses",
    ],
    unavailableInCurrentDataset: [
      "financial_institution",
      "account",
      "account_balance",
      "investments",
      "credit_card_bill",
      "loans",
    ],
  };
}
