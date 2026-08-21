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


export type SpendingCategoryGroup = "food";

const SPENDING_CATEGORY_GROUPS: Record<SpendingCategoryGroup, TransactionCategory[]> = {
  food: ["groceries", "food_delivery", "restaurants"],
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigramSet(value: string): Set<string> {
  const compact = `  ${normalizeSearchText(value)}  `;
  const set = new Set<string>();
  for (let index = 0; index <= compact.length - 3; index += 1) {
    set.add(compact.slice(index, index + 3));
  }
  return set;
}

function trigramSimilarity(left: string, right: string): number {
  const a = trigramSet(left);
  const b = trigramSet(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  return (2 * intersection) / (a.size + b.size);
}

function bestTextSimilarity(query: string, haystack: string): number {
  const normalizedHaystack = normalizeSearchText(haystack);
  const words = normalizedHaystack.split(/\s+/).filter(Boolean);
  let best = trigramSimilarity(query, normalizedHaystack);
  for (const word of words) best = Math.max(best, trigramSimilarity(query, word));
  for (let index = 0; index < words.length - 1; index += 1) {
    best = Math.max(best, trigramSimilarity(query, `${words[index]} ${words[index + 1]}`));
  }
  return best;
}

const SEARCH_ALIASES: Record<string, string[]> = {
  ifood: ["ifood", "i food", "ifd"],
  uber: ["uber", "uber trip", "uberbr"],
  nubank: ["nubank", "nu bank", "roxinho"],
  picpay: ["picpay", "pic pay"],
  neon: ["neon", "banco neon"],
};

function searchVariants(query: string): string[] {
  const normalized = normalizeSearchText(query);
  const matched = Object.entries(SEARCH_ALIASES).find(([canonical, aliases]) =>
    canonical === normalized || aliases.some((alias) => normalizeSearchText(alias) === normalized),
  );
  return [...new Set([
    normalized,
    ...(matched ? [normalizeSearchText(matched[0]), ...matched[1].map(normalizeSearchText)] : []),
  ])].filter(Boolean);
}

export interface RealFinancialDataQuality {
  source: string;
  incomeQuality: "reliable" | "partial" | "insufficient";
  classifiedIncomeCoveragePct: number | null;
  savingsAvailable: boolean;
  savingsUnavailableReason: string | null;
  /** Percentual por quantidade de transações em other; legado para compatibilidade. */
  otherSpendingPct: number;
  otherSpendingTransactionPct: number;
  otherSpendingAmount: number;
  otherSpendingAmountPct: number;
  financialChargesTransactions: number;
  financialChargesAmount: number;
  financialChargesPct: number;
  unclassifiedCardCredits: number;
  truncatedAccounts: number;
}

export class RealFinancialDataService {
  private snapshotPromise: Promise<TransactionRepositorySnapshot> | null = null;
  private snapshotResolvedAtMs: number | null = null;

  constructor(
    private readonly repository: TransactionRepository,
    private readonly options: { snapshotTtlMs?: number } = {},
  ) {}

  private snapshot(): Promise<TransactionRepositorySnapshot> {
    const ttlMs = this.options.snapshotTtlMs ?? Number.POSITIVE_INFINITY;
    const expired =
      this.snapshotResolvedAtMs !== null &&
      Number.isFinite(ttlMs) &&
      Date.now() - this.snapshotResolvedAtMs >= ttlMs;

    if (expired) {
      this.snapshotPromise = null;
      this.snapshotResolvedAtMs = null;
    }

    if (!this.snapshotPromise) {
      this.snapshotPromise = this.repository
        .listTransactions({ includePending: false })
        .then((snapshot) => {
          this.snapshotResolvedAtMs = Date.now();
          return snapshot;
        })
        .catch((error) => {
          // Não envenena o cache com uma Promise rejeitada. Uma falha transitória
          // da Pluggy pode ser tentada novamente na próxima iteração do Agent.
          this.snapshotPromise = null;
          this.snapshotResolvedAtMs = null;
          throw error;
        });
    }

    return this.snapshotPromise;
  }

  invalidateCache(): void {
    this.snapshotPromise = null;
    this.snapshotResolvedAtMs = null;
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
        doubleCountHandledBy: "financial_engine",
        categoryQualityUsesFullClassifiedSet: true,
        savingsMustRespectAvailableFlag: true,
        rawTransactionsSentToLlm: false,
      },
    };
  }

  async getSpendingSummary(range: DateRange = {}) {
    const result = await this.getCashFlow(range);
    if (result.status !== "ok") return result;

    return {
      status: "ok" as const,
      source: result.source,
      period: result.period,
      transactionCount: result.transactionCount,
      spending: result.spending,
      quality: {
        otherSpendingPct: result.quality.otherSpendingPct,
        otherSpendingAmountPct: result.quality.otherSpendingAmountPct,
        financialChargesAmount: result.quality.financialChargesAmount,
        financialChargesPct: result.quality.financialChargesPct,
        unclassifiedCardCredits: result.quality.unclassifiedCardCredits,
      },
      evidenceScope: {
        spendingAvoidsCreditCardDoubleCount: true,
        doubleCountHandledBy: "financial_engine",
        categoryBreakdownIncluded: false,
        institutionBreakdownIncluded: false,
        rawTransactionsSentToLlm: false,
      },
    };
  }

  async getSavingsStatus(range: DateRange = {}) {
    const result = await this.getCashFlow(range);
    if (result.status !== "ok") return result;

    return {
      status: "ok" as const,
      source: result.source,
      period: result.period,
      savings: result.savings,
      income: {
        quality: result.income.quality,
        confirmedIncome: result.income.confirmedIncome,
        estimatedIncome: result.income.estimatedIncome,
        confirmedTransactionCount: result.income.confirmedTransactionCount,
        estimatedTransactionCount: result.income.estimatedTransactionCount,
        classifiedIncomeShareOfBankInflowsPct:
          result.income.classifiedIncomeShareOfBankInflowsPct,
      },
      evidenceScope: {
        savingsMustRespectAvailableFlag: true,
        incomeEstimateMustRespectQuality: true,
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
    options: DateRange & {
      category?: TransactionCategory;
      categoryGroup?: SpendingCategoryGroup;
    } = {},
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
    } else if (options.categoryGroup) {
      const allowed = new Set(SPENDING_CATEGORY_GROUPS[options.categoryGroup]);
      categories = categories.filter((entry) => allowed.has(entry.category));
    }

    if (categories.length === 0) {
      return {
        status: "no_data" as const,
        source: snapshot.source,
        requestedPeriod: options,
        category: options.category ?? null,
        categoryGroup: options.categoryGroup ?? null,
        availablePeriod: getAvailablePeriod(snapshot.transactions),
        message: options.category
          ? `Não existem gastos classificados em ${options.category} no período solicitado.`
          : options.categoryGroup
            ? `Não existem gastos no grupo ${options.categoryGroup} no período solicitado.`
            : "Não existem gastos no período solicitado.",
      };
    }

    const total = categories.reduce((sum, entry) => sum + entry.amount, 0);
    return {
      status: "ok" as const,
      source: snapshot.source,
      period: analysis.period,
      category: options.category ?? null,
      categoryGroup: options.categoryGroup ?? null,
      totalSpendingInReturnedCategories: round2(total),
      categories,
      quality: {
        otherSpendingTransactionPct: analysis.diagnostics.otherSpendingTransactionPct,
        otherSpendingAmountPct: analysis.diagnostics.otherSpendingAmountPct,
        categoryCoveragePct: round2(100 - analysis.diagnostics.otherSpendingAmountPct),
        financialChargesAmount: analysis.diagnostics.financialChargesAmount,
        financialChargesPct: analysis.diagnostics.financialChargesPct,
      },
      evidenceScope: {
        supportsQuantitativeComparison: true,
        supportsBehavioralCause: false,
        aggregationScope: "all_classified_transactions_in_period",
        sampleLimited: false,
        categoryTotalsAreGrossBeforeUnallocatedCardRefunds: true,
        compositionTool: "get_category_transactions",
        categoryGroupDefinition: options.categoryGroup
          ? SPENDING_CATEGORY_GROUPS[options.categoryGroup]
          : null,
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
        aggregationScope: "top_transactions_sample",
        sampleLimited: true,
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
      requestedPeriod: {
        startDate: options.startDate,
        endDate: options.endDate,
      },
      observedPeriod: getAvailablePeriod(transactions),
      institutions,
      evidenceScope: {
        institutionComesFromPluggyItemMapping: true,
        supportsInstitutionComparison: true,
      },
    };
  }

  async getMonthlySeries(
    options: DateRange & { months?: number } = {},
  ) {
    const { snapshot, transactions } = await this.selected(options);
    const monthLimit = Math.min(Math.max(options.months ?? 12, 1), 24);

    if (transactions.length === 0) {
      return {
        status: "no_data" as const,
        source: snapshot.source,
        requestedPeriod: options,
        availablePeriod: getAvailablePeriod(snapshot.transactions),
        points: [],
      };
    }

    const groups = new Map<string, Transaction[]>();
    for (const transaction of transactions) {
      const month = transaction.date.slice(0, 7);
      const current = groups.get(month) ?? [];
      current.push(transaction);
      groups.set(month, current);
    }

    const months = [...groups.keys()].sort().slice(-monthLimit);
    const points = months.map((month) => {
      const monthTransactions = groups.get(month)!;
      const analysis = analyzeFinancialViews(monthTransactions);
      return {
        month,
        transactionCount: monthTransactions.length,
        liquidity: {
          bankInflows: analysis.liquidity.bankInflows,
          bankOutflows: analysis.liquidity.bankOutflows,
          netBankCashFlow: analysis.liquidity.netBankCashFlow,
        },
        spending: {
          bankSpending: analysis.spending.bankSpending,
          cardPurchases: analysis.spending.cardPurchases,
          netSpending: analysis.spending.netSpending,
        },
        income: {
          confirmedIncome: analysis.income.confirmedIncome,
          estimatedIncome: analysis.income.estimatedIncome,
          totalIncomeEstimate: analysis.income.totalIncomeEstimate,
          quality: analysis.income.quality,
        },
        savings: {
          available: analysis.savings.available,
          estimatedSavings: analysis.savings.estimatedSavings,
          estimatedSavingsRatePct: analysis.savings.estimatedSavingsRatePct,
        },
      };
    });

    return {
      status: "ok" as const,
      source: snapshot.source,
      period: { start: months[0]!, end: months.at(-1)! },
      points,
    };
  }

  async getAccountBalances(options: { institution?: string } = {}) {
    const snapshot = await this.snapshot();
    const accounts = snapshot.accounts ?? [];
    const institutionVariants = options.institution ? searchVariants(options.institution) : [];

    const selected = accounts.filter((account) => {
      if (institutionVariants.length === 0) return true;
      const institution = normalizeSearchText(account.institution);
      return institutionVariants.some((variant) =>
        institution.includes(variant) ||
        variant.includes(institution) ||
        trigramSimilarity(institution, variant) >= 0.72,
      );
    });

    if (selected.length === 0) {
      return {
        status: "no_data" as const,
        source: snapshot.source,
        institution: options.institution ?? null,
        message: options.institution
          ? `Não encontrei contas da instituição ${options.institution}.`
          : "O snapshot atual não contém contas com saldo observado.",
        availableInstitutions: [...new Set(accounts.map((account) => account.institution))],
      };
    }

    const bankAccounts = selected.filter((account) => account.type === "BANK");
    const creditAccounts = selected.filter((account) => account.type === "CREDIT");
    const bankWithBalance = bankAccounts.filter((account) => typeof account.balance === "number");
    const currencies = [...new Set(bankWithBalance.map((account) => account.currencyCode))];
    const bankAccountsMissingBalanceCount = bankAccounts.length - bankWithBalance.length;
    const canAggregateBankBalance =
      currencies.length === 1 &&
      bankWithBalance.length > 0 &&
      bankAccountsMissingBalanceCount === 0;
    const totalBankBalance = canAggregateBankBalance
      ? round2(bankWithBalance.reduce((sum, account) => sum + (account.balance ?? 0), 0))
      : null;

    return {
      status: "ok" as const,
      source: snapshot.source,
      fetchedAt: snapshot.fetchedAt,
      institution: options.institution ?? null,
      totalBankBalance,
      currencyCode: currencies.length === 1 ? currencies[0]! : null,
      bankAccountCount: bankAccounts.length,
      bankAccountsWithBalanceCount: bankWithBalance.length,
      bankAccountsMissingBalanceCount,
      totalBankBalanceComplete: canAggregateBankBalance,
      creditAccountCount: creditAccounts.length,
      accounts: selected.map((account) => ({
        institution: account.institution,
        name: account.marketingName ?? account.name,
        type: account.type,
        subtype: account.subtype,
        balance: account.balance,
        currencyCode: account.currencyCode,
        itemLastUpdatedAt: account.itemLastUpdatedAt,
        includedInBankAggregate: account.type === "BANK" && typeof account.balance === "number",
      })),
      evidenceScope: {
        accountBalancesComeFromPluggyAccounts: true,
        totalIncludesOnlyBankAccounts: true,
        totalRequiresBalanceForEveryBankAccount: true,
        creditBalancesAreNeverAddedToAvailableMoney: true,
        accountIdsSentToLlm: false,
        itemIdsSentToLlm: false,
      },
    };
  }

  async getRecentTransactions(
    options: DateRange & {
      limit?: number;
      kind?: "all" | "spending" | "income";
    } = {},
  ) {
    const { snapshot, transactions } = await this.selected(options);
    const kind = options.kind ?? "all";
    const limit = Math.min(Math.max(options.limit ?? 5, 1), 20);

    const filtered = transactions
      .filter((transaction) => {
        if (kind === "spending") {
          return classifyFinancialMovement(transaction) === "spending";
        }
        if (kind === "income") {
          return transaction.type === "credit" && transaction.category === "income";
        }
        return true;
      })
      .sort((a, b) => {
        const byDate = b.date.localeCompare(a.date);
        return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
      });

    const latestDate = filtered[0]?.date ?? null;
    const latestDateCandidates = latestDate
      ? filtered.filter((transaction) => transaction.date === latestDate)
      : [];
    const ambiguousLatestDate = limit === 1 && latestDateCandidates.length > 1;
    const selected = ambiguousLatestDate
      ? latestDateCandidates.slice(0, 5)
      : filtered.slice(0, limit);
    if (selected.length === 0) {
      return {
        status: "no_data" as const,
        source: snapshot.source,
        requestedPeriod: options,
        kind,
        availablePeriod: getAvailablePeriod(snapshot.transactions),
        message: "Não foram encontradas movimentações compatíveis com a consulta.",
      };
    }

    return {
      status: "ok" as const,
      source: snapshot.source,
      kind,
      requestedLimit: limit,
      returnedTransactionCount: selected.length,
      ambiguousLatestDate,
      latestDate,
      latestDateCandidateCount: latestDateCandidates.length,
      transactions: selected.map((transaction) => ({
        date: transaction.date,
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        category: transaction.category,
        institution: transaction.metadata?.institution ?? null,
        accountName: transaction.metadata?.accountName ?? null,
        movement: classifyFinancialMovement(transaction),
      })),
      evidenceScope: {
        orderingUsesAvailableTransactionDate: true,
        intradayOrderingUnavailable: true,
        latestDateTieReturnsCandidates: true,
        rawDatasetSentToLlm: false,
      },
    };
  }

  async searchTransactions(
    options: DateRange & {
      query: string;
      limit?: number;
      kind?: "all" | "spending" | "income";
    },
  ) {
    const { snapshot, transactions } = await this.selected(options);
    const variants = searchVariants(options.query);
    const kind = options.kind ?? "all";
    const limit = Math.min(Math.max(options.limit ?? 10, 1), 20);

    const candidates = transactions
      .filter((transaction) => {
        if (kind === "spending" && classifyFinancialMovement(transaction) !== "spending") return false;
        if (kind === "income" && !(transaction.type === "credit" && transaction.category === "income")) return false;
        return true;
      })
      .map((transaction) => {
        const haystack = normalizeSearchText([
          transaction.description,
          transaction.metadata?.institution ?? "",
          transaction.metadata?.accountName ?? "",
        ].join(" "));
        let bestScore = 0;
        let matchType: "exact" | "fuzzy" | null = null;
        for (const variant of variants) {
          if (!variant) continue;
          if (haystack.includes(variant)) {
            bestScore = Math.max(bestScore, 1);
            matchType = "exact";
            continue;
          }
          const tokens = variant.split(/\s+/).filter(Boolean);
          const tokenCoverage = tokens.length
            ? tokens.filter((token) => haystack.includes(token)).length / tokens.length
            : 0;
          const fuzzy = Math.max(tokenCoverage * 0.9, bestTextSimilarity(variant, haystack));
          if (fuzzy > bestScore) {
            bestScore = fuzzy;
            if (fuzzy >= 0.55) matchType = "fuzzy";
          }
        }
        return { transaction, score: bestScore, matchType };
      })
      .filter((candidate) => candidate.matchType !== null && candidate.score >= 0.55)
      .sort((a, b) => b.score - a.score || b.transaction.date.localeCompare(a.transaction.date));

    const serialize = (transaction: Transaction) => ({
      date: transaction.date,
      description: transaction.description,
      amount: transaction.amount,
      type: transaction.type,
      category: transaction.category,
      institution: transaction.metadata?.institution ?? null,
      accountName: transaction.metadata?.accountName ?? null,
      movement: classifyFinancialMovement(transaction),
    });

    if (candidates.length === 0) {
      const alternatives = transactions
        .filter((transaction) =>
          kind === "spending"
            ? classifyFinancialMovement(transaction) === "spending"
            : kind === "income"
              ? transaction.type === "credit" && transaction.category === "income"
              : true,
        )
        .sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date))
        .slice(0, 5)
        .map(serialize);

      return {
        status: "no_data" as const,
        source: snapshot.source,
        query: options.query,
        kind,
        requestedPeriod: options,
        availablePeriod: getAvailablePeriod(snapshot.transactions),
        message: `Não encontrei movimentações correspondentes a "${options.query}".`,
        alternatives,
        alternativeScope: alternatives.length > 0 ? "same_requested_period" : "none",
        evidenceScope: {
          fuzzySearchUsed: true,
          alternativesAreNotQueryMatches: true,
          alternativesAreBounded: true,
          rawDatasetSentToLlm: false,
        },
      };
    }

    const selected = candidates.slice(0, limit);
    return {
      status: "ok" as const,
      source: snapshot.source,
      query: options.query,
      kind,
      totalMatchCount: candidates.length,
      returnedTransactionCount: selected.length,
      sampleTruncated: selected.length < candidates.length,
      fuzzyMatchUsed: selected.some((candidate) => candidate.matchType === "fuzzy"),
      transactions: selected.map((candidate) => ({
        ...serialize(candidate.transaction),
        matchType: candidate.matchType,
        matchScore: round2(candidate.score * 100),
      })),
      evidenceScope: {
        searchFields: ["description", "institution", "account_name"],
        aliasesSupported: Object.keys(SEARCH_ALIASES),
        fuzzySearchUsed: true,
        sampleLimited: true,
        rawDatasetSentToLlm: false,
      },
    };
  }

  async getDailySpendingSummary(range: DateRange = {}) {
    const { snapshot, transactions } = await this.selected(range);
    const spending = transactions.filter(
      (transaction) => classifyFinancialMovement(transaction) === "spending",
    );

    if (spending.length === 0) {
      return {
        status: "no_data" as const,
        source: snapshot.source,
        requestedPeriod: range,
        availablePeriod: getAvailablePeriod(snapshot.transactions),
        message: "Não existem gastos no período solicitado.",
      };
    }

    const byDay = new Map<string, { amount: number; count: number }>();
    for (const transaction of spending) {
      const current = byDay.get(transaction.date) ?? { amount: 0, count: 0 };
      current.amount += transaction.amount;
      current.count += 1;
      byDay.set(transaction.date, current);
    }

    const days = [...byDay.entries()]
      .map(([date, value]) => ({
        date,
        amount: round2(value.amount),
        transactionCount: value.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const transactionDates = transactions.map((transaction) => transaction.date).sort();
    const firstDate = range.startDate ?? transactionDates[0]!;
    const lastDate = range.endDate ?? transactionDates.at(-1)!;
    const calendarDays =
      Math.floor(
        (new Date(`${lastDate}T00:00:00.000Z`).getTime() -
          new Date(`${firstDate}T00:00:00.000Z`).getTime()) /
          86_400_000,
      ) + 1;
    const totalSpending = round2(
      spending.reduce((sum, transaction) => sum + transaction.amount, 0),
    );
    const largestDay = [...days].sort((a, b) => b.amount - a.amount)[0]!;

    return {
      status: "ok" as const,
      source: snapshot.source,
      period: { start: firstDate, end: lastDate },
      totalSpending,
      calendarDays,
      spendingDays: days.length,
      averagePerCalendarDay: round2(totalSpending / calendarDays),
      averagePerSpendingDay: round2(totalSpending / days.length),
      largestSpendingDay: largestDay,
      dailyPointCount: days.length,
      recentDailyPoints: days.slice(-31),
      dailyPointsTruncated: days.length > 31,
      evidenceScope: {
        averagesCalculatedByBackend: true,
        detailedDailyPointsAreBounded: true,
        spendingAvoidsCreditCardDoubleCount: true,
        rawDatasetSentToLlm: false,
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
      source: snapshot.source,
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
        "monthly_financial_trend",
        "recent_transactions",
        "transaction_search",
        "daily_spending_summary",
        "account_balances",
        "financial_charges_category",
        "savings_when_income_quality_allows",
      ],
      notIntegratedInCurrentAgent: [
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
      otherSpendingTransactionPct: analysis.diagnostics.otherSpendingTransactionPct,
      otherSpendingAmount: analysis.diagnostics.otherSpendingAmount,
      otherSpendingAmountPct: analysis.diagnostics.otherSpendingAmountPct,
      financialChargesTransactions: analysis.diagnostics.financialChargesTransactions,
      financialChargesAmount: analysis.diagnostics.financialChargesAmount,
      financialChargesPct: analysis.diagnostics.financialChargesPct,
      unclassifiedCardCredits: analysis.diagnostics.unclassifiedCardCredits,
      truncatedAccounts: snapshot.diagnostics.truncatedAccounts ?? 0,
    };
  }
}
