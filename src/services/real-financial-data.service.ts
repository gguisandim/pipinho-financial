import type {
  Transaction,
  TransactionCategory,
} from "../domain/finance.js";
import {
  analyzeFinancialViews,
  classifyFinancialMovement,
} from "../financial-engine/real-views.js";
import {
  filterTransactions,
  getAvailablePeriod,
  type DateRange,
} from "../financial-engine/queries.js";
import type {
  TransactionRepository,
  TransactionRepositorySnapshot,
} from "../repositories/transaction.repository.js";

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface RealFinancialDataQuality {
  source: string;
  incomeQuality: "reliable" | "partial" | "insufficient";
  classifiedIncomeCoveragePct: number | null;
  savingsAvailable: boolean;
  savingsUnavailableReason: string | null;
  otherSpendingPct: number;
  unclassifiedCardCredits: number;
  truncatedAccounts: number;
}

export class RealFinancialDataService {
  private snapshotPromise: Promise<TransactionRepositorySnapshot> | null = null;

  constructor(private readonly repository: TransactionRepository) {}

  private snapshot(): Promise<TransactionRepositorySnapshot> {
    this.snapshotPromise ??= this.repository.listTransactions({ includePending: false });
    return this.snapshotPromise;
  }

  private async selected(range: DateRange = {}) {
    const snapshot = await this.snapshot();
    const transactions = filterTransactions(snapshot.transactions, range);
    return { snapshot, transactions };
  }

  async getFinancialPeriod() {
    const snapshot = await this.snapshot();
    return {
      ...getAvailablePeriod(snapshot.transactions),
      source: snapshot.source,
      fetchedAt: snapshot.fetchedAt,
    };
  }

  async getCashFlow(range: DateRange = {}) {
    const { snapshot, transactions } = await this.selected(range);
    if (transactions.length === 0) {
      return {
        status: "no_data" as const,
        source: snapshot.source,
        requestedPeriod: range,
        availablePeriod: getAvailablePeriod(snapshot.transactions),
        message: "Não existem transações no período solicitado.",
      };
    }

    const analysis = analyzeFinancialViews(transactions);
    return {
      status: "ok" as const,
      source: snapshot.source,
      period: analysis.period,
      transactionCount: analysis.diagnostics.totalTransactions,
      liquidity: analysis.liquidity,
      income: analysis.income,
      spending: {
        bankSpending: analysis.spending.bankSpending,
        cardPurchases: analysis.spending.cardPurchases,
        grossSpending: analysis.spending.grossSpending,
        knownCardRefunds: analysis.spending.knownCardRefunds,
        netSpending: analysis.spending.netSpending,
        transactionCount: analysis.spending.transactionCount,
      },
      savings: analysis.savings,
      quality: this.qualityFromAnalysis(analysis, snapshot),
      evidenceScope: {
        cashFlowIsBankLiquidity: true,
        spendingAvoidsCreditCardDoubleCount: true,
        savingsMustRespectAvailableFlag: true,
        rawTransactionsSentToLlm: false,
      },
    };
  }

  async getIncome(range: DateRange = {}) {
    const { snapshot, transactions } = await this.selected(range);
    if (transactions.length === 0) {
      return {
        status: "no_data" as const,
        source: snapshot.source,
        requestedPeriod: range,
        availablePeriod: getAvailablePeriod(snapshot.transactions),
        message: "Não existem transações no período solicitado.",
      };
    }

    const analysis = analyzeFinancialViews(transactions);
    return {
      status: "ok" as const,
      source: snapshot.source,
      period: analysis.period,
      income: analysis.income,
      quality: {
        incomeQuality: analysis.income.quality,
        classifiedIncomeCoveragePct:
          analysis.income.classifiedIncomeShareOfBankInflowsPct,
      },
      evidenceScope: {
        confirmedIncomeCanBeStatedAsObserved: true,
        estimatedIncomeMustBeLabeledAsLowConfidence: true,
        unclassifiedBankInflowsMustNotBeCalledIncome: true,
      },
    };
  }

  async getSpendingByCategory(
    options: DateRange & { category?: TransactionCategory } = {},
  ) {
    const { snapshot, transactions } = await this.selected(options);
    if (transactions.length === 0) {
      return {
        status: "no_data" as const,
        source: snapshot.source,
        requestedPeriod: options,
        availablePeriod: getAvailablePeriod(snapshot.transactions),
        message: "Não existem transações no período solicitado.",
      };
    }

    const analysis = analyzeFinancialViews(transactions);
    let categories = analysis.spending.expensesByCategory;
    if (options.category) {
      categories = categories.filter((entry) => entry.category === options.category);
    }

    if (categories.length === 0) {
      return {
        status: "no_data" as const,
        source: snapshot.source,
        requestedPeriod: options,
        category: options.category ?? null,
        availablePeriod: getAvailablePeriod(snapshot.transactions),
        message: options.category
          ? `Não existem gastos classificados em ${options.category} no período solicitado.`
          : "Não existem gastos no período solicitado.",
      };
    }

    const total = categories.reduce((sum, entry) => sum + entry.amount, 0);
    return {
      status: "ok" as const,
      source: snapshot.source,
      period: analysis.period,
      category: options.category ?? null,
      totalSpendingInReturnedCategories: round2(total),
      categories,
      quality: {
        otherSpendingPct: analysis.diagnostics.otherSpendingPct,
        categoryCoveragePct: round2(100 - analysis.diagnostics.otherSpendingPct),
      },
      evidenceScope: {
        supportsQuantitativeComparison: true,
        supportsBehavioralCause: false,
        categoryTotalsAreGrossBeforeUnallocatedCardRefunds: true,
        compositionTool: "get_category_transactions",
      },
    };
  }

  async getCategoryTransactions(
    options: DateRange & {
      category: TransactionCategory;
      limit?: number;
    },
  ) {
    const { snapshot, transactions } = await this.selected(options);
    const all = transactions
      .filter(
        (transaction) =>
          transaction.category === options.category &&
          classifyFinancialMovement(transaction) === "spending",
      )
      .sort((a, b) => b.amount - a.amount);

    if (all.length === 0) {
      return {
        status: "no_data" as const,
        source: snapshot.source,
        requestedPeriod: options,
        category: options.category,
        availablePeriod: getAvailablePeriod(snapshot.transactions),
        message: `Não existem gastos classificados em ${options.category} no período solicitado.`,
      };
    }

    const limit = Math.min(Math.max(options.limit ?? 10, 1), 20);
    const selected = all.slice(0, limit);
    return {
      status: "ok" as const,
      source: snapshot.source,
      category: options.category,
      totalTransactionCount: all.length,
      returnedTransactionCount: selected.length,
      sampleTruncated: selected.length < all.length,
      transactions: selected.map((transaction) => ({
        date: transaction.date,
        description: transaction.description,
        amount: transaction.amount,
        institution: transaction.metadata?.institution ?? null,
        accountName: transaction.metadata?.accountName ?? null,
      })),
      evidenceScope: {
        supportsCompositionExplanation: true,
        supportsBehavioralCause: false,
        note:
          "A lista é uma amostra limitada das maiores transações da categoria. Ela descreve composição observada, não causa comportamental.",
      },
    };
  }

  async getLargestExpenses(options: DateRange & { limit?: number } = {}) {
    const { snapshot, transactions } = await this.selected(options);
    const limit = Math.min(Math.max(options.limit ?? 5, 1), 10);
    const expenses = transactions
      .filter((transaction) => classifyFinancialMovement(transaction) === "spending")
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit);

    if (expenses.length === 0) {
      return {
        status: "no_data" as const,
        source: snapshot.source,
        requestedPeriod: options,
        availablePeriod: getAvailablePeriod(snapshot.transactions),
        message: "Não existem gastos no período solicitado.",
      };
    }

    return {
      status: "ok" as const,
      source: snapshot.source,
      expenses: expenses.map((transaction) => ({
        date: transaction.date,
        description: transaction.description,
        category: transaction.category,
        amount: transaction.amount,
        institution: transaction.metadata?.institution ?? null,
        accountName: transaction.metadata?.accountName ?? null,
        paymentRail:
          transaction.metadata?.role === "card_purchase" ? "credit_card" : "bank",
      })),
    };
  }

  async getSpendingByInstitution(
    options: DateRange & { institution?: string } = {},
  ) {
    const { snapshot, transactions } = await this.selected(options);
    const normalizedFilter = options.institution?.trim().toLowerCase();
    const spending = transactions.filter(
      (transaction) => classifyFinancialMovement(transaction) === "spending",
    );

    const totals = new Map<string, { amount: number; count: number }>();
    for (const transaction of spending) {
      const institution = transaction.metadata?.institution ?? "Não identificada";
      if (
        normalizedFilter &&
        !institution.toLowerCase().includes(normalizedFilter)
      ) {
        continue;
      }
      const current = totals.get(institution) ?? { amount: 0, count: 0 };
      current.amount += transaction.amount;
      current.count += 1;
      totals.set(institution, current);
    }

    const institutions = [...totals.entries()]
      .map(([institution, value]) => ({
        institution,
        amount: round2(value.amount),
        transactionCount: value.count,
      }))
      .sort((a, b) => b.amount - a.amount);

    if (institutions.length === 0) {
      return {
        status: "no_data" as const,
        source: snapshot.source,
        institution: options.institution ?? null,
        availablePeriod: getAvailablePeriod(snapshot.transactions),
        message: options.institution
          ? `Não foram encontrados gastos para a instituição ${options.institution}.`
          : "Não existem gastos por instituição no período solicitado.",
      };
    }

    return {
      status: "ok" as const,
      source: snapshot.source,
      institution: options.institution ?? null,
      institutions,
      evidenceScope: {
        institutionComesFromPluggyItemMapping: true,
        supportsInstitutionComparison: true,
      },
    };
  }

  async getDataCapabilities() {
    const snapshot = await this.snapshot();
    const period = getAvailablePeriod(snapshot.transactions);
    const quality =
      snapshot.transactions.length > 0
        ? this.qualityFromAnalysis(analyzeFinancialViews(snapshot.transactions), snapshot)
        : null;

    return {
      status: "ok" as const,
      source: "pluggy",
      availablePeriod: period,
      availableTransactionFields: [
        "date",
        "description",
        "amount",
        "type",
        "category",
        "financial_institution",
        "account_id",
        "account_name",
        "account_type",
        "transaction_role",
      ],
      supportedAnalyses: [
        "available_period",
        "bank_liquidity",
        "income_with_quality",
        "spending_without_credit_card_double_count",
        "expenses_by_category",
        "category_transactions_sample",
        "largest_expenses",
        "spending_by_institution",
        "savings_when_income_quality_allows",
      ],
      notIntegratedInCurrentAgent: [
        "account_balance",
        "investments",
        "investment_transactions",
        "loans",
        "credit_card_bill_projection",
      ],
      quality,
      privacy: {
        rawDatasetSentToLlm: false,
        repositoryTransactionCount: snapshot.transactions.length,
        detailedTransactionToolsAreBounded: true,
      },
    };
  }

  private qualityFromAnalysis(
    analysis: ReturnType<typeof analyzeFinancialViews>,
    snapshot: TransactionRepositorySnapshot,
  ): RealFinancialDataQuality {
    return {
      source: snapshot.source,
      incomeQuality: analysis.income.quality,
      classifiedIncomeCoveragePct:
        analysis.income.classifiedIncomeShareOfBankInflowsPct,
      savingsAvailable: analysis.savings.available,
      savingsUnavailableReason: analysis.savings.unavailableReason,
      otherSpendingPct: analysis.diagnostics.otherSpendingPct,
      unclassifiedCardCredits: analysis.diagnostics.unclassifiedCardCredits,
      truncatedAccounts: snapshot.diagnostics.truncatedAccounts ?? 0,
    };
  }
}
