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

export interface TransactionRepositorySnapshot {
  source: string;
  fetchedAt: string;
  transactions: Transaction[];
  diagnostics: TransactionRepositoryDiagnostics;
}

export interface TransactionRepository {
  readonly source: string;
  listTransactions(
    query?: TransactionRepositoryQuery,
  ): Promise<TransactionRepositorySnapshot>;
}
