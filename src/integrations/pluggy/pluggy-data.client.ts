import {
  pluggyAccountSchema,
  pluggyAccountsResponseSchema,
  pluggyConnectorSchema,
  pluggyItemSchema,
  pluggyTransactionsCursorResponseSchema,
  type PluggyAccount,
  type PluggyConnector,
  type PluggyItem,
  type PluggyTransaction,
} from "./pluggy-data.schemas.js";
import { PluggyApiClient, PluggyApiError } from "./pluggy-api.client.js";
import { maskIdentifier } from "../../security/redaction.js";

export interface ListTransactionsOptions {
  dateFrom?: string;
  dateTo?: string;
  maxPages?: number;
}

export interface PluggyTransactionCollection {
  accountId: string;
  transactions: PluggyTransaction[];
  pages: number;
  truncated: boolean;
}

function appendQuery(path: string, params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

function connectorIdFromItem(item: PluggyItem): number | undefined {
  return item.connectorId ?? item.connector?.id;
}

export class PluggyDataClient {
  constructor(private readonly api: PluggyApiClient) {}

  async fetchItem(itemId: string): Promise<PluggyItem> {
    const body = await this.api.getJson<unknown>(`/items/${encodeURIComponent(itemId)}`);
    const parsed = pluggyItemSchema.safeParse(body);
    if (!parsed.success) {
      throw new PluggyApiError(
        `Resposta inválida ao recuperar Item ${maskIdentifier(itemId)}.`,
        200,
        "invalid_response",
        parsed.error.flatten(),
      );
    }
    return parsed.data;
  }

  async fetchConnectorForItem(item: PluggyItem): Promise<PluggyConnector | null> {
    if (item.connector?.id && item.connector?.name) {
      const parsed = pluggyConnectorSchema.safeParse(item.connector);
      if (parsed.success) return parsed.data;
    }

    const connectorId = connectorIdFromItem(item);
    if (!connectorId) return null;

    const body = await this.api.getJson<unknown>(`/connectors/${connectorId}`);
    const parsed = pluggyConnectorSchema.safeParse(body);
    if (!parsed.success) {
      throw new PluggyApiError(
        `Resposta inválida ao recuperar Connector ${connectorId}.`,
        200,
        "invalid_response",
        parsed.error.flatten(),
      );
    }
    return parsed.data;
  }

  async fetchAccounts(itemId: string): Promise<PluggyAccount[]> {
    const body = await this.api.getJson<unknown>(
      appendQuery("/accounts", { itemId }),
    );

    // A API documenta um envelope `results`, mas aceitamos array por tolerância
    // a SDKs/proxies que possam remover o envelope.
    if (Array.isArray(body)) {
      const parsed = pluggyAccountSchema.array().safeParse(body);
      if (!parsed.success) {
        throw new PluggyApiError(
          `Resposta inválida ao listar Accounts do Item ${maskIdentifier(itemId)}.`,
          200,
          "invalid_response",
          parsed.error.flatten(),
        );
      }
      return parsed.data;
    }

    const parsed = pluggyAccountsResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new PluggyApiError(
        `Resposta inválida ao listar Accounts do Item ${maskIdentifier(itemId)}.`,
        200,
        "invalid_response",
        parsed.error.flatten(),
      );
    }
    return parsed.data.results;
  }

  async fetchAllTransactions(
    accountId: string,
    options: ListTransactionsOptions = {},
  ): Promise<PluggyTransactionCollection> {
    const maxPages = Math.max(1, options.maxPages ?? 25);
    let path = appendQuery("/v2/transactions", {
      accountId,
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
    });

    const transactions: PluggyTransaction[] = [];
    const seenNext = new Set<string>();
    let pages = 0;
    let truncated = false;

    while (path) {
      pages += 1;
      const body = await this.api.getJson<unknown>(path);
      const parsed = pluggyTransactionsCursorResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new PluggyApiError(
          `Resposta inválida ao listar Transactions da Account ${maskIdentifier(accountId)}.`,
          200,
          "invalid_response",
          parsed.error.flatten(),
        );
      }

      transactions.push(...parsed.data.results);

      const next = parsed.data.next ?? null;
      if (!next) break;

      if (pages >= maxPages) {
        truncated = true;
        break;
      }

      if (seenNext.has(next)) {
        throw new PluggyApiError(
          `Cursor repetido ao paginar Transactions da Account ${maskIdentifier(accountId)}; execução interrompida para evitar loop.`,
          200,
          "invalid_response",
        );
      }
      seenNext.add(next);

      // A documentação recomenda reutilizar `next` como a query string completa.
      path = next.startsWith("?") ? `/v2/transactions${next}` : next;
    }

    return {
      accountId,
      transactions,
      pages,
      truncated,
    };
  }
}
