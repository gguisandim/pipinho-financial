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
import type { StructuredLlmProvider } from "../llm/providers/structured-llm-provider.js";
import type { DashboardDataService } from "./dashboard-data.service.js";

export class DashboardInsightService {
  constructor(
    private readonly dashboard: DashboardDataService,
    private readonly llm: StructuredLlmProvider,
  ) {}

  async generate(options: {
    startDate?: string;
    endDate?: string;
    months?: number;
    maxCards?: number;
  } = {}) {
    const overview = await this.dashboard.getOverview(options);
    if (overview.status !== "ok") {
      return {
        status: "no_data" as const,
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

    // Acrescenta referências úteis mesmo quando não há um signal específico.
    allowedRefs.add("spending.netSpending");
    allowedRefs.add("liquidity.netBankCashFlow");
    if (overview.quality.otherSpendingAmountPct > 0) {
      allowedRefs.add("quality.otherSpendingAmountPct");
    }
    if (overview.quality.financialChargesAmount > 0) {
      allowedRefs.add("quality.financialChargesAmount");
      allowedRefs.add("quality.financialChargesPct");
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

    const cards = llmResult.data.cards
      .slice(0, maxCards)
      .map((card: DashboardInsights["cards"][number]) => ({
        ...card,
        // O LLM só pode apontar para métricas autorizadas pelo snapshot.
        metricRefs: card.metricRefs.filter((ref: DashboardMetricRef) => allowedRefs.has(ref)),
      }))
      .filter((card: DashboardInsights["cards"][number]) => card.metricRefs.length > 0)
      .map((card: DashboardInsights["cards"][number]) => ({
        ...card,
        evidence: card.metricRefs
          .map((ref: DashboardMetricRef) => this.dashboard.resolveMetric(overview, ref))
          .filter((item: { ref: DashboardMetricRef; value: number | null; unit: "BRL" | "percent" | "count" } | null): item is { ref: DashboardMetricRef; value: number | null; unit: "BRL" | "percent" | "count" } => item !== null),
      }));

    return {
      status: "ok" as const,
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
  }
}
