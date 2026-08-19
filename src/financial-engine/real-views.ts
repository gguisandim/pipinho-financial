import type {
  Transaction,
  TransactionCategory,
} from "../domain/finance.js";

export type FinancialMovementKind =
  | "income"
  | "estimated_income"
  | "spending"
  | "card_refund"
  | "internal_transfer"
  | "credit_card_payment"
  | "investment_movement"
  | "loan_or_financing"
  | "unclassified_card_credit"
  | "liquidity_only";

export interface FinancialViewPeriod {
  start: string;
  end: string;
}

export interface CategoryAmount {
  category: TransactionCategory;
  amount: number;
}

export interface FinancialViewDiagnostics {
  totalTransactions: number;
  bankTransactions: number;
  cardTransactions: number;
  internalTransfersExcluded: number;
  creditCardPaymentsExcludedFromSpending: number;
  investmentMovementsExcludedFromSpending: number;
  loanOrFinancingExcludedFromSpending: number;
  cardRefundsApplied: number;
  unclassifiedCardCredits: number;
  lowConfidenceIncomeTransactions: number;
  otherSpendingTransactions: number;
  /** Percentual por quantidade de transações; mantido por compatibilidade. */
  otherSpendingPct: number;
  otherSpendingTransactionPct: number;
  otherSpendingAmount: number;
  otherSpendingAmountPct: number;
  financialChargesTransactions: number;
  financialChargesAmount: number;
  financialChargesPct: number;
}

export interface FinancialViewsAnalysis {
  period: FinancialViewPeriod;
  liquidity: {
    bankInflows: number;
    bankOutflows: number;
    netBankCashFlow: number;
    transactionCount: number;
    note: string;
  };
  income: {
    confirmedIncome: number;
    estimatedIncome: number;
    totalIncomeEstimate: number;
    confirmedTransactionCount: number;
    estimatedTransactionCount: number;
    unclassifiedBankInflows: number;
    unclassifiedBankInflowCount: number;
    classifiedIncomeShareOfBankInflowsPct: number | null;
    quality: "reliable" | "partial" | "insufficient";
    note: string;
  };
  spending: {
    bankSpending: number;
    cardPurchases: number;
    grossSpending: number;
    knownCardRefunds: number;
    netSpending: number;
    transactionCount: number;
    expensesByCategory: CategoryAmount[];
    note: string;
  };
  savings: {
    available: boolean;
    estimatedSavings: number | null;
    estimatedSavingsRatePct: number | null;
    unavailableReason: string | null;
    note: string;
  };
  diagnostics: FinancialViewDiagnostics;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function evidenceText(transaction: Transaction): string {
  return normalizeText(
    [
      transaction.metadata?.providerCategory,
      transaction.metadata?.operationType,
      transaction.description,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function includesAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

export function isSamePersonTransfer(transaction: Transaction): boolean {
  const evidence = evidenceText(transaction);
  return includesAny(evidence, [
    "same person transfer",
    "mesma titularidade",
    "mesmo titular",
    "entre minhas contas",
    "transferencia interna propria",
  ]);
}

export function isCreditCardPayment(transaction: Transaction): boolean {
  const evidence = evidenceText(transaction);
  return includesAny(evidence, [
    "credit card payment",
    "pagamento de fatura",
    "pagamento fatura",
    "pag fatura",
    "pgto fatura",
    "pagt fatura",
    "pagamento cartao",
    "pagamento cartao de credito",
  ]);
}

export function isInvestmentMovement(transaction: Transaction): boolean {
  const evidence = evidenceText(transaction);
  return includesAny(evidence, [
    "investments",
    "automatic investment",
    "fixed income",
    "mutual funds",
    "variable income",
    "resgate aplic financeira",
    "rendimento aplic financeira",
    "aplicacao financeira",
    "investimento",
  ]);
}

export function isLoanOrFinancingMovement(transaction: Transaction): boolean {
  const evidence = evidenceText(transaction);
  return includesAny(evidence, [
    "loans and financing",
    "loan ",
    "financing",
    "financiamento",
    "operacao credito",
  ]);
}

export function isKnownCardRefund(transaction: Transaction): boolean {
  if (transaction.metadata?.role !== "card_credit") return false;
  if (isCreditCardPayment(transaction)) return false;

  const evidence = evidenceText(transaction);
  return includesAny(evidence, [
    "cashback",
    "refund",
    "reembolso",
    "estorno",
    "reversal",
    "devolucao",
    "credito compra",
  ]);
}

export function classifyFinancialMovement(transaction: Transaction): FinancialMovementKind {
  const role = transaction.metadata?.role;

  if (isSamePersonTransfer(transaction)) return "internal_transfer";
  if (isCreditCardPayment(transaction)) return "credit_card_payment";
  if (isInvestmentMovement(transaction)) return "investment_movement";
  if (isLoanOrFinancingMovement(transaction)) return "loan_or_financing";

  if (role === "card_credit") {
    return isKnownCardRefund(transaction)
      ? "card_refund"
      : "unclassified_card_credit";
  }

  if (role === "card_purchase") return "spending";

  if (role === "bank_outflow") return "spending";

  if (role === "bank_inflow") {
    if (
      transaction.category === "income" &&
      transaction.metadata?.categorySource !== "direction_fallback"
    ) {
      return "income";
    }

    if (transaction.category === "income") return "estimated_income";
    return "liquidity_only";
  }

  // Compatibilidade com fixtures antigas sem metadata.role.
  if (transaction.type === "debit") return "spending";
  if (transaction.type === "credit") return "income";

  return "liquidity_only";
}

function getPeriod(transactions: Transaction[]): FinancialViewPeriod {
  if (transactions.length === 0) {
    throw new Error("Não é possível analisar views financeiras sem transações.");
  }

  const dates = transactions.map((transaction) => transaction.date).sort();
  return {
    start: dates[0]!,
    end: dates.at(-1)!,
  };
}

export function analyzeFinancialViews(
  transactions: Transaction[],
): FinancialViewsAnalysis {
  if (transactions.length === 0) {
    throw new Error("Não é possível analisar views financeiras sem transações.");
  }

  const classified = transactions.map((transaction) => ({
    transaction,
    kind: classifyFinancialMovement(transaction),
  }));

  const bankTransactions = classified.filter(({ transaction }) =>
    transaction.metadata?.role === "bank_inflow" ||
    transaction.metadata?.role === "bank_outflow" ||
    !transaction.metadata?.role,
  );

  const liquidityTransactions = bankTransactions.filter(
    ({ kind }) => kind !== "internal_transfer",
  );

  const bankInflows = liquidityTransactions
    .filter(({ transaction }) => transaction.type === "credit")
    .reduce((sum, { transaction }) => sum + transaction.amount, 0);

  const bankOutflows = liquidityTransactions
    .filter(({ transaction }) => transaction.type === "debit")
    .reduce((sum, { transaction }) => sum + transaction.amount, 0);

  const confirmedIncomeTransactions = classified.filter(
    ({ kind }) => kind === "income",
  );
  const estimatedIncomeTransactions = classified.filter(
    ({ kind }) => kind === "estimated_income",
  );

  const confirmedIncome = confirmedIncomeTransactions.reduce(
    (sum, { transaction }) => sum + transaction.amount,
    0,
  );
  const estimatedIncome = estimatedIncomeTransactions.reduce(
    (sum, { transaction }) => sum + transaction.amount,
    0,
  );
  const totalIncomeEstimate = confirmedIncome + estimatedIncome;

  const unclassifiedBankInflowTransactions = classified.filter(
    ({ transaction, kind }) =>
      transaction.metadata?.role === "bank_inflow" && kind === "liquidity_only",
  );
  const unclassifiedBankInflows = unclassifiedBankInflowTransactions.reduce(
    (sum, { transaction }) => sum + transaction.amount,
    0,
  );

  const classifiedIncomeShareOfBankInflowsPct =
    bankInflows > 0 ? (totalIncomeEstimate / bankInflows) * 100 : null;

  const incomeQuality: "reliable" | "partial" | "insufficient" =
    confirmedIncomeTransactions.length === 0
      ? "insufficient"
      : estimatedIncomeTransactions.length === 0 &&
          (classifiedIncomeShareOfBankInflowsPct ?? 100) >= 50
        ? "reliable"
        : "partial";

  const spendingTransactions = classified.filter(
    ({ kind }) => kind === "spending",
  );

  const bankSpending = spendingTransactions
    .filter(({ transaction }) => transaction.metadata?.role !== "card_purchase")
    .reduce((sum, { transaction }) => sum + transaction.amount, 0);

  const cardPurchases = spendingTransactions
    .filter(({ transaction }) => transaction.metadata?.role === "card_purchase")
    .reduce((sum, { transaction }) => sum + transaction.amount, 0);

  const knownCardRefunds = classified
    .filter(({ kind }) => kind === "card_refund")
    .reduce((sum, { transaction }) => sum + transaction.amount, 0);

  const grossSpending = bankSpending + cardPurchases;
  const netSpending = Math.max(0, grossSpending - knownCardRefunds);

  const categoryMap = new Map<TransactionCategory, number>();
  for (const { transaction } of spendingTransactions) {
    categoryMap.set(
      transaction.category,
      (categoryMap.get(transaction.category) ?? 0) + transaction.amount,
    );
  }

  const expensesByCategory = [...categoryMap.entries()]
    .map(([category, amount]) => ({ category, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);

  const otherSpendingRows = spendingTransactions.filter(
    ({ transaction }) => transaction.category === "other",
  );
  const otherSpendingTransactions = otherSpendingRows.length;
  const otherSpendingAmount = otherSpendingRows.reduce(
    (sum, { transaction }) => sum + transaction.amount,
    0,
  );
  const otherSpendingTransactionPct =
    spendingTransactions.length > 0
      ? (otherSpendingTransactions / spendingTransactions.length) * 100
      : 0;
  const otherSpendingAmountPct =
    grossSpending > 0 ? (otherSpendingAmount / grossSpending) * 100 : 0;

  const financialChargeRows = spendingTransactions.filter(
    ({ transaction }) => transaction.category === "financial_charges",
  );
  const financialChargesAmount = financialChargeRows.reduce(
    (sum, { transaction }) => sum + transaction.amount,
    0,
  );
  const financialChargesPct =
    grossSpending > 0 ? (financialChargesAmount / grossSpending) * 100 : 0;

  const internalTransfersExcluded = classified.filter(
    ({ kind }) => kind === "internal_transfer",
  ).length;
  const creditCardPaymentsExcludedFromSpending = classified.filter(
    ({ kind }) => kind === "credit_card_payment",
  ).length;
  const investmentMovementsExcludedFromSpending = classified.filter(
    ({ kind }) => kind === "investment_movement",
  ).length;
  const loanOrFinancingExcludedFromSpending = classified.filter(
    ({ kind }) => kind === "loan_or_financing",
  ).length;
  const cardRefundsApplied = classified.filter(
    ({ kind }) => kind === "card_refund",
  ).length;
  const unclassifiedCardCredits = classified.filter(
    ({ kind }) => kind === "unclassified_card_credit",
  ).length;

  // Savings rate exige duas evidências mínimas:
  // 1) pelo menos uma entrada de renda confirmada; e
  // 2) a renda classificada precisa explicar uma parcela material das entradas BANK.
  // Só exigir uma renda confirmada ainda permitiria um denominador minúsculo diante
  // de muitas entradas não classificadas, produzindo taxas absurdas.
  const MIN_CLASSIFIED_INCOME_COVERAGE_PCT = 50;
  const hasConfirmedIncome = confirmedIncomeTransactions.length > 0;
  const incomeCoveragePct = classifiedIncomeShareOfBankInflowsPct ?? 0;
  const savingsAvailable =
    hasConfirmedIncome &&
    totalIncomeEstimate > 0 &&
    incomeCoveragePct >= MIN_CLASSIFIED_INCOME_COVERAGE_PCT;

  const estimatedSavings = savingsAvailable
    ? totalIncomeEstimate - netSpending
    : null;
  const estimatedSavingsRatePct =
    savingsAvailable && estimatedSavings !== null
      ? (estimatedSavings / totalIncomeEstimate) * 100
      : null;

  let savingsUnavailableReason: string | null = null;
  if (!savingsAvailable) {
    if (!hasConfirmedIncome) {
      savingsUnavailableReason =
        "Receita insuficientemente identificada: nenhuma entrada de renda confirmada no período.";
    } else if (incomeCoveragePct < MIN_CLASSIFIED_INCOME_COVERAGE_PCT) {
      savingsUnavailableReason =
        `Receita insuficientemente coberta: apenas ${round2(incomeCoveragePct)}% das entradas BANK foram classificadas como renda; mínimo conservador de ${MIN_CLASSIFIED_INCOME_COVERAGE_PCT}%.`;
    } else {
      savingsUnavailableReason =
        "Receita insuficiente para calcular savings rate com segurança.";
    }
  }

  return {
    period: getPeriod(transactions),
    liquidity: {
      bankInflows: round2(bankInflows),
      bankOutflows: round2(bankOutflows),
      netBankCashFlow: round2(bankInflows - bankOutflows),
      transactionCount: liquidityTransactions.length,
      note:
        "Liquidez usa apenas movimentos BANK e exclui transferências de mesma titularidade. Pagamento de fatura e movimentos de investimento continuam aqui porque alteram caixa bancário.",
    },
    income: {
      confirmedIncome: round2(confirmedIncome),
      estimatedIncome: round2(estimatedIncome),
      totalIncomeEstimate: round2(totalIncomeEstimate),
      confirmedTransactionCount: confirmedIncomeTransactions.length,
      estimatedTransactionCount: estimatedIncomeTransactions.length,
      unclassifiedBankInflows: round2(unclassifiedBankInflows),
      unclassifiedBankInflowCount: unclassifiedBankInflowTransactions.length,
      classifiedIncomeShareOfBankInflowsPct:
        classifiedIncomeShareOfBankInflowsPct === null
          ? null
          : round2(classifiedIncomeShareOfBankInflowsPct),
      quality: incomeQuality,
      note:
        "Receita confirmada depende de evidência categórica. Entradas classificadas apenas pela direção ficam separadas como baixa confiança; demais BANK/CREDIT permanecem não classificadas em vez de serem tratadas automaticamente como renda.",
    },
    spending: {
      bankSpending: round2(bankSpending),
      cardPurchases: round2(cardPurchases),
      grossSpending: round2(grossSpending),
      knownCardRefunds: round2(knownCardRefunds),
      netSpending: round2(netSpending),
      transactionCount: spendingTransactions.length,
      expensesByCategory,
      note:
        "Spending combina compras no cartão e saídas bancárias de consumo, mas exclui pagamento de fatura, transferências próprias, investimentos e financiamento para evitar dupla contagem. Apenas estornos/cashbacks reconhecidos reduzem o gasto líquido.",
    },
    savings: {
      available: savingsAvailable,
      estimatedSavings:
        estimatedSavings === null ? null : round2(estimatedSavings),
      estimatedSavingsRatePct:
        estimatedSavingsRatePct === null ? null : round2(estimatedSavingsRatePct),
      unavailableReason: savingsUnavailableReason,
      note:
        savingsAvailable
          ? "Estimativa = receita confirmada + receita de baixa confiança - spending líquido. Interprete junto com income.quality."
          : "Savings foi omitido porque a renda confirmada/cobertura das entradas BANK não atingiu o limiar conservador; publicar uma taxa nesse cenário produziria precisão enganosa.",
    },
    diagnostics: {
      totalTransactions: transactions.length,
      bankTransactions: transactions.filter((transaction) =>
        transaction.metadata?.accountType === "BANK" || !transaction.metadata?.accountType,
      ).length,
      cardTransactions: transactions.filter(
        (transaction) => transaction.metadata?.accountType === "CREDIT",
      ).length,
      internalTransfersExcluded,
      creditCardPaymentsExcludedFromSpending,
      investmentMovementsExcludedFromSpending,
      loanOrFinancingExcludedFromSpending,
      cardRefundsApplied,
      unclassifiedCardCredits,
      lowConfidenceIncomeTransactions: estimatedIncomeTransactions.length,
      otherSpendingTransactions,
      otherSpendingPct: round2(otherSpendingTransactionPct),
      otherSpendingTransactionPct: round2(otherSpendingTransactionPct),
      otherSpendingAmount: round2(otherSpendingAmount),
      otherSpendingAmountPct: round2(otherSpendingAmountPct),
      financialChargesTransactions: financialChargeRows.length,
      financialChargesAmount: round2(financialChargesAmount),
      financialChargesPct: round2(financialChargesPct),
    },
  };
}
