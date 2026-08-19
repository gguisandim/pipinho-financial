import type { TransactionCategory } from "../domain/finance.js";

export type DashboardSeverity = "info" | "warning" | "critical";

export type DashboardMetricRef =
  | "liquidity.bankInflows"
  | "liquidity.bankOutflows"
  | "liquidity.netBankCashFlow"
  | "spending.bankSpending"
  | "spending.cardPurchases"
  | "spending.grossSpending"
  | "spending.knownCardRefunds"
  | "spending.netSpending"
  | "income.totalIncomeEstimate"
  | "income.classifiedCoveragePct"
  | "quality.otherSpendingPct"
  | "quality.otherSpendingAmountPct"
  | "quality.financialChargesAmount"
  | "quality.financialChargesPct"
  | "quality.unclassifiedCardCredits"
  | "quality.truncatedAccounts"
  | "savings.estimatedSavings"
  | "savings.estimatedSavingsRatePct";

export interface DashboardSignal {
  id: string;
  code:
    | "negative_liquidity"
    | "income_quality_insufficient"
    | "income_quality_partial"
    | "high_other_spending"
    | "high_financial_charges"
    | "unclassified_card_credits"
    | "truncated_accounts";
  severity: DashboardSeverity;
  title: string;
  message: string;
  metricRefs: DashboardMetricRef[];
}

export interface DashboardCategoryPoint {
  category: TransactionCategory;
  amount: number;
  sharePct: number;
}

export interface DashboardInstitutionPoint {
  institution: string;
  amount: number;
  transactionCount: number;
  sharePct: number;
}

export interface DashboardMonthlyPoint {
  month: string;
  transactionCount: number;
  liquidity: {
    bankInflows: number;
    bankOutflows: number;
    netBankCashFlow: number;
  };
  spending: {
    bankSpending: number;
    cardPurchases: number;
    netSpending: number;
  };
  income: {
    confirmedIncome: number;
    estimatedIncome: number;
    totalIncomeEstimate: number;
    quality: "reliable" | "partial" | "insufficient";
  };
  savings: {
    available: boolean;
    estimatedSavings: number | null;
    estimatedSavingsRatePct: number | null;
  };
}
