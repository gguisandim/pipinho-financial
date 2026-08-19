import { env } from "../config/env.js";
import type { DashboardMetricRef } from "../dashboard/dashboard.types.js";
import {
  DashboardInsightsSchema,
  type DashboardInsights,
} from "../llm/schemas/dashboard-insights.schema.js";
import {
  DASHBOARD_INSIGHTS_SYSTEM_PROMPT,
  buildDashboardInsightsPrompt,
} from "../llm/prompts/dashboard-insights.prompt.js";
import type { LlmUsage } from "../llm/providers/llm-provider.js";
import type { StructuredLlmProvider } from "../llm/providers/structured-llm-provider.js";
import type { DashboardDataService } from "./dashboard-data.service.js";

type DashboardOverviewResult = Awaited<
  ReturnType<DashboardDataService["getOverview"]>
>;
type DashboardOverviewOk = Extract<DashboardOverviewResult, { status: "ok" }>;
type DashboardOverviewNoData = Extract<
  DashboardOverviewResult,
  { status: "no_data" }
>;

export interface DashboardInsightEvidence {
  ref: DashboardMetricRef;
  value: number | null;
  unit: "BRL" | "percent" | "count";
}

export type DashboardInsightCardResult = DashboardInsights["cards"][number] & {
  evidence: DashboardInsightEvidence[];
};

export type DashboardInsightGenerationResult =
  | {
      status: "no_data";
      overview: DashboardOverviewNoData;
      insights: null;
    }
  | {
      status: "ok";
      generatedAt: string;
      source: DashboardOverviewOk["source"];
      period: DashboardOverviewOk["dataset"]["selectedPeriod"];
      headline: string;
      cards: DashboardInsightCardResult[];
      deterministicSignals: DashboardOverviewOk["signals"];
      quality: DashboardOverviewOk["quality"];
      privacy: {
        rawTransactionsSentToLlm: false;
        transactionDescriptionsSentToLlm: false;
        accountIdsSentToLlm: false;
      };
      telemetry: {
        provider: string;
        model: string;
        latencyMs: number;
        usage: LlmUsage;
      };
    };

export class DashboardInsightService {
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: DashboardInsightGenerationResult }
  >();

  constructor(
    private readonly dashboard: DashboardDataService,
    private readonly llm: StructuredLlmProvider,
  ) {}

  async generate(
    options: {
      startDate?: string;
      endDate?: string;
      months?: number;
      maxCards?: number;
    } = {},
  ): Promise<DashboardInsightGenerationResult> {
    const cacheKey = JSON.stringify({
      startDate: options.startDate ?? null,
      endDate: options.endDate ?? null,
      months: options.months ?? null,
      maxCards: options.maxCards ?? null,
    });
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    if (cached) this.cache.delete(cacheKey);

    const overview = await this.dashboard.getOverview(options);
    if (overview.status !== "ok") {
      return {
        status: "no_data",
        overview,
        insights: null,
      };
    }

    const maxCards = Math.min(
      Math.max(options.maxCards ?? env.DASHBOARD_AI_MAX_CARDS, 1),
      6,
    );

    const allowedRefs = new Set<DashboardMetricRef>();
    for (const signal of overview.signals) {
      for (const ref of signal.metricRefs) allowedRefs.add(ref);
    }

    allowedRefs.add("spending.netSpending");
    allowedRefs.add("liquidity.netBankCashFlow");
    if (overview.quality.otherSpendingAmountPct > 0) {
      allowedRefs.add("quality.otherSpendingAmountPct");
    }
    if (overview.quality.financialChargesAmount > 0) {
      allowedRefs.add("quality.financialChargesAmount");
      allowedRefs.add("quality.financialChargesPct");
    }
    if (overview.metrics.income.quality !== "insufficient") {
      allowedRefs.add("income.totalIncomeEstimate");
      allowedRefs.add("income.classifiedCoveragePct");
    }
    if (overview.metrics.savings.available) {
      allowedRefs.add("savings.estimatedSavings");
      allowedRefs.add("savings.estimatedSavingsRatePct");
    }

    const llmResult = await this.llm.completeStructured<DashboardInsights>({
      system: DASHBOARD_INSIGHTS_SYSTEM_PROMPT,
      user: buildDashboardInsightsPrompt({
        maxCards,
        period: overview.dataset.selectedPeriod,
        metrics: {
          liquidity: overview.metrics.liquidity,
          spending: overview.metrics.spending,
          income: {
            totalIncomeEstimate: overview.metrics.income.totalIncomeEstimate,
            quality: overview.metrics.income.quality,
            classifiedIncomeShareOfBankInflowsPct:
              overview.metrics.income.classifiedIncomeShareOfBankInflowsPct,
          },
          savings: overview.metrics.savings,
        },
        quality: overview.quality,
        signals: overview.signals,
        topCategories: overview.categories.slice(0, 5),
        topInstitutions: overview.institutions.slice(0, 3),
      }),
      schemaName: "dashboard_insights",
      schema: DashboardInsightsSchema,
      maxCompletionTokens: env.DASHBOARD_AI_MAX_COMPLETION_TOKENS,
    });

    const cards: DashboardInsightCardResult[] = llmResult.data.cards
      .slice(0, maxCards)
      .map((card) => ({
        ...card,
        metricRefs: card.metricRefs.filter((ref) => allowedRefs.has(ref)),
      }))
      .filter((card) => card.metricRefs.length > 0)
      .map((card) => ({
        ...card,
        evidence: card.metricRefs
          .map((ref) => this.dashboard.resolveMetric(overview, ref))
          .filter((item): item is DashboardInsightEvidence => item !== null),
      }));

    const result: DashboardInsightGenerationResult = {
      status: "ok",
      generatedAt: new Date().toISOString(),
      source: overview.source,
      period: overview.dataset.selectedPeriod,
      headline: llmResult.data.headline,
      cards,
      deterministicSignals: overview.signals,
      quality: overview.quality,
      privacy: {
        rawTransactionsSentToLlm: false,
        transactionDescriptionsSentToLlm: false,
        accountIdsSentToLlm: false,
      },
      telemetry: {
        provider: llmResult.provider,
        model: llmResult.model,
        latencyMs: llmResult.latencyMs,
        usage: llmResult.usage,
      },
    };

    this.cache.set(cacheKey, {
      expiresAt: Date.now() + env.DASHBOARD_AI_CACHE_TTL_MS,
      value: result,
    });
    if (this.cache.size > 50) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    return result;
  }
}
