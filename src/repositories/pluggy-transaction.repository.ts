import type {
  PluggyAccount,
  PluggyItem,
} from "../integrations/pluggy/pluggy-data.schemas.js";
import type { PluggyTransactionCollection } from "../integrations/pluggy/pluggy-data.client.js";
import { mapPluggyTransaction } from "../integrations/pluggy/mappers/pluggy-transaction.mapper.js";
import type { PluggyItemReference } from "../config/env.js";
import type {
  TransactionRepository,
  TransactionRepositoryQuery,
  TransactionRepositorySnapshot,
} from "./transaction.repository.js";
import type { Transaction } from "../domain/finance.js";

export interface PluggyTransactionDataSource {
  fetchItem(itemId: string): Promise<PluggyItem>;
  fetchConnectorForItem(item: PluggyItem): Promise<{ name: string } | null>;
  fetchAccounts(itemId: string): Promise<PluggyAccount[]>;
  fetchAllTransactions(
    accountId: string,
    options?: { dateFrom?: string; dateTo?: string; maxPages?: number },
  ): Promise<PluggyTransactionCollection>;
}

export interface PluggyTransactionRepositoryOptions {
  itemReferences: PluggyItemReference[];
  maxPages?: number;
  timeZone?: string;
}

export class PluggyTransactionRepository implements TransactionRepository {
  readonly source = "pluggy";

  constructor(
    private readonly dataClient: PluggyTransactionDataSource,
    private readonly options: PluggyTransactionRepositoryOptions,
  ) {}

  async listTransactions(
    query: TransactionRepositoryQuery = {},
  ): Promise<TransactionRepositorySnapshot> {
    const transactions: Transaction[] = [];
    const seenIds = new Set<string>();
    let rawTransactions = 0;
    let skippedPending = 0;
    let skippedInvalid = 0;
    let accounts = 0;
    let truncatedAccounts = 0;

    for (const ref of this.options.itemReferences) {
      const item = await this.dataClient.fetchItem(ref.itemId);
      const connector = await this.dataClient.fetchConnectorForItem(item);
      const institution = ref.label ?? connector?.name ?? item.connector?.name ?? "Instituição não identificada";
      const itemAccounts = await this.dataClient.fetchAccounts(item.id);
      accounts += itemAccounts.length;

      for (const account of itemAccounts) {
        const collection = await this.dataClient.fetchAllTransactions(account.id, {
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
          maxPages: this.options.maxPages,
        });
        if (collection.truncated) truncatedAccounts += 1;

        for (const raw of collection.transactions) {
          rawTransactions += 1;

          if (!query.includePending && raw.status === "PENDING") {
            skippedPending += 1;
            continue;
          }

          const mapped = mapPluggyTransaction(raw, {
            account,
            institution,
            itemId: item.id,
            timeZone: this.options.timeZone,
          });

          if (!mapped.ok) {
            skippedInvalid += 1;
            continue;
          }

          if (seenIds.has(mapped.transaction.id)) continue;
          seenIds.add(mapped.transaction.id);
          transactions.push(mapped.transaction);
        }
      }
    }

    transactions.sort((a, b) => a.date.localeCompare(b.date));

    return {
      source: this.source,
      fetchedAt: new Date().toISOString(),
      transactions,
      diagnostics: {
        source: this.source,
        items: this.options.itemReferences.length,
        accounts,
        rawTransactions,
        mappedTransactions: transactions.length,
        skippedPending,
        skippedInvalid,
        truncatedAccounts,
      },
    };
  }
}
