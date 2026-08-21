import type { Transaction } from "../domain/finance.js";

export interface TransactionRepositoryQuery {
  dateFrom?: string;
  dateTo?: string;
  includePending?: boolean;
}

export interface TransactionRepositoryDiagnostics {
  source: string;
  items?: number;
  accounts?: number;
  rawTransactions: number;
  mappedTransactions: number;
  skippedPending: number;
  skippedInvalid: number;
  truncatedAccounts?: number;
}

export interface FinancialAccountSnapshot {
  institution: string;
  name: string;
  marketingName: string | null;
  type: "BANK" | "CREDIT";
  subtype: string;
  balance: number | null;
  currencyCode: string;
  itemLastUpdatedAt: string | null;
}

export interface TransactionRepositorySnapshot {
  source: string;
  fetchedAt: string;
  transactions: Transaction[];
  /** Snapshot enxuto de Accounts para saldo atual; IDs sensíveis ficam fora do contrato. */
  accounts?: FinancialAccountSnapshot[];
  diagnostics: TransactionRepositoryDiagnostics;
}

export interface TransactionRepository {
  readonly source: string;
  listTransactions(
    query?: TransactionRepositoryQuery,
  ): Promise<TransactionRepositorySnapshot>;
}
