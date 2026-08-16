import type { FinancialSummary, Transaction, TransactionCategory } from "../domain/finance.js";

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function summarizeTransactions(transactions: Transaction[]): FinancialSummary {
  if (transactions.length === 0) {
    throw new Error("Não é possível gerar resumo sem transações.");
  }

  const ordered = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

  const totalIncome = transactions
    .filter((tx) => tx.type === "credit")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalExpenses = transactions
    .filter((tx) => tx.type === "debit")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const categoryMap = new Map<TransactionCategory, number>();

  for (const tx of transactions) {
    if (tx.type !== "debit") continue;
    categoryMap.set(tx.category, (categoryMap.get(tx.category) ?? 0) + tx.amount);
  }

  const expensesByCategory = [...categoryMap.entries()]
    .map(([category, amount]) => ({ category, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);

  const netCashFlow = totalIncome - totalExpenses;
  const savingsRatePct = totalIncome > 0 ? (netCashFlow / totalIncome) * 100 : 0;

  return {
    period: {
      start: ordered[0].date,
      end: ordered[ordered.length - 1].date,
    },
    transactionCount: transactions.length,
    totalIncome: round2(totalIncome),
    totalExpenses: round2(totalExpenses),
    netCashFlow: round2(netCashFlow),
    savingsRatePct: round2(savingsRatePct),
    expensesByCategory,
  };
}
