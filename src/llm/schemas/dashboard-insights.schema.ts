import { z } from "zod";

export const DashboardMetricRefSchema = z.enum([
  "liquidity.bankInflows",
  "liquidity.bankOutflows",
  "liquidity.netBankCashFlow",
  "spending.bankSpending",
  "spending.cardPurchases",
  "spending.grossSpending",
  "spending.knownCardRefunds",
  "spending.netSpending",
  "income.totalIncomeEstimate",
  "income.classifiedCoveragePct",
  "quality.otherSpendingPct",
  "quality.unclassifiedCardCredits",
  "quality.truncatedAccounts",
  "savings.estimatedSavings",
  "savings.estimatedSavingsRatePct",
]);

const noDigits = /^[^0-9]*$/;

export const DashboardInsightCardSchema = z.object({
  priority: z.enum(["low", "medium", "high"]),
  kind: z.enum(["warning", "opportunity", "context"]),
  title: z.string().min(3).max(70).regex(noDigits),
  message: z.string().min(10).max(220).regex(noDigits),
  suggestedAction: z.string().min(5).max(160).regex(noDigits),
  uiAction: z.enum([
    "open_monthly",
    "open_spending_categories",
    "open_institutions",
    "open_income_review",
    "open_quality",
    "none",
  ]),
  metricRefs: z.array(DashboardMetricRefSchema).min(1).max(3),
  confidence: z.enum(["low", "medium", "high"]),
});

export const DashboardInsightsSchema = z.object({
  headline: z.string().min(5).max(120).regex(noDigits),
  cards: z.array(DashboardInsightCardSchema).max(6),
});

export type DashboardInsights = z.infer<typeof DashboardInsightsSchema>;
