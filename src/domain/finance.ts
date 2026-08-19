export type TransactionType = "credit" | "debit";

export type TransactionCategory =
  | "income"
  | "housing"
  | "groceries"
  | "food_delivery"
  | "transport"
  | "utilities"
  | "subscriptions"
  | "health"
  | "restaurants"
  | "education"
  | "fitness"
  | "shopping"
  | "financial_charges"
  | "other";

export type TransactionSource = "synthetic" | "pluggy";

export type TransactionRole =
  | "bank_inflow"
  | "bank_outflow"
  | "card_purchase"
  | "card_credit";

export type TransactionStatus = "posted" | "pending";

export type CategorySource =
  | "pluggy"
  | "description_rule"
  | "direction_fallback"
  | "fallback";

export interface TransactionMetadata {
  source: TransactionSource;
  institution?: string;
  itemId?: string;
  accountId?: string;
  accountName?: string;
  accountType?: "BANK" | "CREDIT";
  accountSubtype?: string;
  currencyCode?: string;
  providerCategory?: string | null;
  providerCategoryId?: string | null;
  providerId?: string | null;
  operationType?: string | null;
  originalAmount?: number;
  role?: TransactionRole;
  status?: TransactionStatus;
  categorySource?: CategorySource;
  categoryConfidence?: "high" | "medium" | "low";
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  /** Valor canônico sempre positivo. A direção fica em `type`. */
  amount: number;
  type: TransactionType;
  category: TransactionCategory;
  metadata?: TransactionMetadata;
}

export interface CategoryTotal {
  category: TransactionCategory;
  amount: number;
}

export interface FinancialSummary {
  period: {
    start: string;
    end: string;
  };
  transactionCount: number;
  totalIncome: number;
  totalExpenses: number;
  netCashFlow: number;
  savingsRatePct: number;
  expensesByCategory: CategoryTotal[];
}
