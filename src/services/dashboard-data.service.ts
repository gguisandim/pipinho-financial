import type { DateRange } from "../financial-engine/queries.js";
import type { RealFinancialDataService } from "./real-financial-data.service.js";
import type {
  DashboardCategoryPoint,
  DashboardInstitutionPoint,
  DashboardMetricRef,
  DashboardSignal,
} from "../dashboard/dashboard.types.js";

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function pct(value: number, total: number): number {
  if (total <= 0) return 0;
  return round2((value / total) * 100);
}

export class DashboardDataService {
  constructor(private readonly finance: RealFinancialDataService) {}

  async getOverview(options: DateRange & { months?: number } = {}) {
    const range: DateRange = {
      startDate: options.startDate,
      endDate: options.endDate,
    };

    const [period, cashFlow, categoryResult, institutionResult, monthly] =
      await Promise.all([
        this.finance.getFinancialPeriod(),
        this.finance.getCashFlow(range),
        this.finance.getSpendingByCategory(range),
        this.finance.getSpendingByInstitution(range),
        this.finance.getMonthlySeries({
          ...range,
          months: options.months ?? 12,
        }),
      ]);

    if (cashFlow.status !== "ok") {
      return {
        schemaVersion: "1.0" as const,
        status: "no_data" as const,
        generatedAt: new Date().toISOString(),
        source: cashFlow.source,
        availablePeriod: cashFlow.availablePeriod,
        requestedPeriod: cashFlow.requestedPeriod,
        message: cashFlow.message,
      };
    }

    const categories: DashboardCategoryPoint[] =
      categoryResult.status === "ok"
        ? categoryResult.categories.map((entry) => ({
            category: entry.category,
            amount: entry.amount,
            sharePct: pct(entry.amount, cashFlow.spending.grossSpending),
          }))
        : [];

    const institutions: DashboardInstitutionPoint[] =
      institutionResult.status === "ok"
        ? institutionResult.institutions.map((entry) => ({
            ...entry,
            sharePct: pct(entry.amount, cashFlow.spending.grossSpending),
          }))
        : [];

    const metrics = {
      liquidity: cashFlow.liquidity,
      income: cashFlow.income,
      spending: cashFlow.spending,
      savings: cashFlow.savings,
    };

    const signals = this.buildSignals({
      liquidity: cashFlow.liquidity,
      income: cashFlow.income,
      quality: cashFlow.quality,
    });

    return {
      schemaVersion: "1.0" as const,
      status: "ok" as const,
      generatedAt: new Date().toISOString(),
      source: cashFlow.source,
      dataset: {
        fetchedAt: period.fetchedAt,
        availablePeriod: {
          start: period.start,
          end: period.end,
        },
        selectedPeriod: cashFlow.period,
        transactionCount: cashFlow.transactionCount,
      },
      metrics,
      categories,
      institutions,
      monthly,
      quality: cashFlow.quality,
      signals,
      privacy: {
        rawTransactionsIncluded: false,
        rawTransactionsSentToLlm: false,
      },
    };
  }

  async getQuality(range: DateRange = {}) {
    const result = await this.finance.getCashFlow(range);
    if (result.status !== "ok") return result;

    return {
      status: "ok" as const,
      source: result.source,
      period: result.period,
      quality: result.quality,
      savings: result.savings,
      signals: this.buildSignals({
        liquidity: result.liquidity,
        income: result.income,
        quality: result.quality,
      }),
    };
  }

  async getCategories(range: DateRange = {}) {
    const result = await this.finance.getSpendingByCategory(range);
    if (result.status !== "ok") return result;

    const gross = result.categories.reduce((sum, item) => sum + item.amount, 0);
    return {
      ...result,
      categories: result.categories.map((entry) => ({
        ...entry,
        sharePct: pct(entry.amount, gross),
      })),
    };
  }

  async getInstitutions(range: DateRange & { institution?: string } = {}) {
    const result = await this.finance.getSpendingByInstitution(range);
    if (result.status !== "ok") return result;
    const total = result.institutions.reduce((sum, item) => sum + item.amount, 0);
    return {
      ...result,
      institutions: result.institutions.map((entry) => ({
        ...entry,
        sharePct: pct(entry.amount, total),
      })),
    };
  }

  async getLargestExpenses(options: DateRange & { limit?: number } = {}) {
    return this.finance.getLargestExpenses(options);
  }

  async getMonthly(options: DateRange & { months?: number } = {}) {
    return this.finance.getMonthlySeries(options);
  }

  async getCapabilities() {
    return this.finance.getDataCapabilities();
  }

  resolveMetric(
    overview: Awaited<ReturnType<DashboardDataService["getOverview"]>>,
    ref: DashboardMetricRef,
  ): { ref: DashboardMetricRef; value: number | null; unit: "BRL" | "percent" | "count" } | null {
    if (overview.status !== "ok") return null;

    const map: Record<DashboardMetricRef, { value: number | null; unit: "BRL" | "percent" | "count" }> = {
      "liquidity.bankInflows": { value: overview.metrics.liquidity.bankInflows, unit: "BRL" },
      "liquidity.bankOutflows": { value: overview.metrics.liquidity.bankOutflows, unit: "BRL" },
      "liquidity.netBankCashFlow": { value: overview.metrics.liquidity.netBankCashFlow, unit: "BRL" },
      "spending.bankSpending": { value: overview.metrics.spending.bankSpending, unit: "BRL" },
      "spending.cardPurchases": { value: overview.metrics.spending.cardPurchases, unit: "BRL" },
      "spending.grossSpending": { value: overview.metrics.spending.grossSpending, unit: "BRL" },
      "spending.knownCardRefunds": { value: overview.metrics.spending.knownCardRefunds, unit: "BRL" },
      "spending.netSpending": { value: overview.metrics.spending.netSpending, unit: "BRL" },
      "income.totalIncomeEstimate": { value: overview.metrics.income.totalIncomeEstimate, unit: "BRL" },
      "income.classifiedCoveragePct": { value: overview.metrics.income.classifiedIncomeShareOfBankInflowsPct, unit: "percent" },
      "quality.otherSpendingPct": { value: overview.quality.otherSpendingPct, unit: "percent" },
      "quality.unclassifiedCardCredits": { value: overview.quality.unclassifiedCardCredits, unit: "count" },
      "quality.truncatedAccounts": { value: overview.quality.truncatedAccounts, unit: "count" },
      "savings.estimatedSavings": { value: overview.metrics.savings.estimatedSavings, unit: "BRL" },
      "savings.estimatedSavingsRatePct": { value: overview.metrics.savings.estimatedSavingsRatePct, unit: "percent" },
    };

    return { ref, ...map[ref] };
  }

  private buildSignals(input: {
    liquidity: { netBankCashFlow: number };
    income: { quality: "reliable" | "partial" | "insufficient" };
    quality: {
      otherSpendingPct: number;
      unclassifiedCardCredits: number;
      truncatedAccounts: number;
    };
  }): DashboardSignal[] {
    const signals: DashboardSignal[] = [];

    if (input.quality.truncatedAccounts > 0) {
      signals.push({
        id: "data-truncated",
        code: "truncated_accounts",
        severity: "critical",
        title: "Histórico incompleto",
        message: "Uma ou mais contas atingiram o limite local de paginação; o dashboard pode estar incompleto.",
        metricRefs: ["quality.truncatedAccounts"],
      });
    }

    if (input.income.quality === "insufficient") {
      signals.push({
        id: "income-insufficient",
        code: "income_quality_insufficient",
        severity: "warning",
        title: "Renda ainda não confiável",
        message: "A base não possui evidência suficiente para apresentar renda e taxa de poupança como indicadores confiáveis.",
        metricRefs: ["income.classifiedCoveragePct"],
      });
    } else if (input.income.quality === "partial") {
      signals.push({
        id: "income-partial",
        code: "income_quality_partial",
        severity: "warning",
        title: "Renda parcialmente classificada",
        message: "Parte das entradas bancárias ainda não foi classificada com confiança.",
        metricRefs: ["income.classifiedCoveragePct"],
      });
    }

    if (input.liquidity.netBankCashFlow < 0) {
      signals.push({
        id: "negative-liquidity",
        code: "negative_liquidity",
        severity: "warning",
        title: "Fluxo bancário líquido negativo",
        message: "As saídas bancárias do período superaram as entradas bancárias observadas.",
        metricRefs: ["liquidity.netBankCashFlow"],
      });
    }

    if (input.quality.otherSpendingPct >= 30) {
      signals.push({
        id: "category-coverage",
        code: "high_other_spending",
        severity: input.quality.otherSpendingPct >= 50 ? "critical" : "warning",
        title: "Cobertura de categorias limitada",
        message: "Uma parcela relevante dos gastos permanece em other; comparações por categoria devem exibir essa limitação.",
        metricRefs: ["quality.otherSpendingPct"],
      });
    }

    if (input.quality.unclassifiedCardCredits > 0) {
      signals.push({
        id: "card-credits-unclassified",
        code: "unclassified_card_credits",
        severity: "info",
        title: "Créditos de cartão não classificados",
        message: "Existem créditos de cartão cuja semântica não foi presumida pelo engine.",
        metricRefs: ["quality.unclassifiedCardCredits"],
      });
    }

    return signals;
  }
}
