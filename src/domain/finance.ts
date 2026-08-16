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
  | "shopping";

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: TransactionCategory;
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
