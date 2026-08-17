import { syntheticTransactions } from "../fixtures/synthetic-transactions.js";
import type {
  TransactionRepository,
  TransactionRepositoryQuery,
  TransactionRepositorySnapshot,
} from "./transaction.repository.js";

function inRange(date: string, query: TransactionRepositoryQuery): boolean {
  if (query.dateFrom && date < query.dateFrom) return false;
  if (query.dateTo && date > query.dateTo) return false;
  return true;
}

export class SyntheticTransactionRepository implements TransactionRepository {
  readonly source = "synthetic";

  async listTransactions(
    query: TransactionRepositoryQuery = {},
  ): Promise<TransactionRepositorySnapshot> {
    const transactions = syntheticTransactions
      .filter((transaction) => inRange(transaction.date, query))
      .map((transaction) => ({
        ...transaction,
        metadata: transaction.metadata ?? { source: "synthetic" as const },
      }));

    return {
      source: this.source,
      fetchedAt: new Date().toISOString(),
      transactions,
      diagnostics: {
        source: this.source,
        rawTransactions: transactions.length,
        mappedTransactions: transactions.length,
        skippedPending: 0,
        skippedInvalid: 0,
      },
    };
  }
}
