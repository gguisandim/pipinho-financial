export type IncomeQuality = "reliable" | "partial" | "insufficient";
export type Severity = "info" | "warning" | "critical";

export interface DashboardSignal {
  id: string;
  code: string;
  severity: Severity;
  title: string;
  message: string;
  metricRefs: string[];
}

export interface MonthlyPoint {
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
    quality: IncomeQuality;
  };
  savings: {
    available: boolean;
    estimatedSavings: number | null;
    estimatedSavingsRatePct: number | null;
  };
}

export interface DashboardOverviewOk {
  schemaVersion: "1.0";
  status: "ok";
  generatedAt: string;
  source: string;
  dataset: {
    fetchedAt: string;
    availablePeriod: { start: string; end: string };
    selectedPeriod: { start: string; end: string };
    transactionCount: number;
  };
  metrics: {
    liquidity: {
      bankInflows: number;
      bankOutflows: number;
      netBankCashFlow: number;
    };
    income: {
      confirmedIncome: number;
      estimatedIncome: number;
      totalIncomeEstimate: number;
      classifiedIncomeShareOfBankInflowsPct: number | null;
      quality: IncomeQuality;
    };
    spending: {
      bankSpending: number;
      cardPurchases: number;
      grossSpending: number;
      knownCardRefunds: number;
      netSpending: number;
      transactionCount: number;
    };
    savings: {
      available: boolean;
      estimatedSavings: number | null;
      estimatedSavingsRatePct: number | null;
      unavailableReason?: string | null;
    };
  };
  categories: Array<{ category: string; amount: number; sharePct: number }>;
  institutions: Array<{
    institution: string;
    amount: number;
    transactionCount: number;
    sharePct: number;
  }>;
  monthly: {
    status: "ok" | "no_data";
    points?: MonthlyPoint[];
  };
  quality: {
    source: string;
    incomeQuality: IncomeQuality;
    classifiedIncomeCoveragePct: number | null;
    savingsAvailable: boolean;
    savingsUnavailableReason: string | null;
    otherSpendingPct: number;
    otherSpendingTransactionPct: number;
    otherSpendingAmount: number;
    otherSpendingAmountPct: number;
    financialChargesTransactions: number;
    financialChargesAmount: number;
    financialChargesPct: number;
    unclassifiedCardCredits: number;
    truncatedAccounts: number;
  };
  signals: DashboardSignal[];
  privacy: {
    rawTransactionsIncluded: false;
    rawTransactionsSentToLlm: false;
  };
}

export interface DashboardOverviewNoData {
  schemaVersion?: string;
  status: "no_data";
  message?: string;
  availablePeriod?: { start: string; end: string } | null;
}

export type DashboardOverview = DashboardOverviewOk | DashboardOverviewNoData;

export interface InsightEvidence {
  ref: string;
  value: number | null;
  unit: "BRL" | "percent" | "count";
}

export interface DashboardInsights {
  status: "ok" | "no_data";
  headline?: string;
  cards?: Array<{
    priority: "low" | "medium" | "high";
    kind: "warning" | "opportunity" | "context";
    title: string;
    message: string;
    suggestedAction: string;
    uiAction: string;
    metricRefs: string[];
    confidence: "low" | "medium" | "high";
    evidence: InsightEvidence[];
  }>;
}

export interface AssistantResponse {
  status: "ok";
  answer: string;
  referenceDate: string;
  executionMode: string;
  conversation?: {
    id: string | null;
    historyMessagesUsed: number;
    contextualRouting: boolean;
  };
  grounding: {
    causal: boolean;
    quality: boolean;
    provenance: boolean;
    evidence: boolean;
  };
  meta: {
    toolCallCount: number;
    iterations: number;
    latencyMs: number;
  };
}

export interface LargestExpensesResponse {
  status: "ok" | "no_data";
  message?: string;
  expenses?: Array<{
    date: string;
    description: string;
    category: string;
    amount: number;
    institution: string | null;
    accountName: string | null;
    paymentRail: "credit_card" | "bank";
  }>;
}

export interface MonthlySeriesResponse {
  status: "ok" | "no_data";
  source?: string;
  period?: { start: string; end: string };
  requestedPeriod?: { startDate?: string; endDate?: string };
  availablePeriod?: { start: string; end: string } | null;
  points: MonthlyPoint[];
}
