import { env, getPluggyItemReferences, requirePluggyCredentials } from "../../config/env.js";
import { PluggyApiClient } from "./pluggy-api.client.js";
import { PluggyAuthClient } from "./pluggy-auth.client.js";
import { PluggyDataClient } from "./pluggy-data.client.js";
import { PluggyTransactionRepository } from "../../repositories/pluggy-transaction.repository.js";

export function createPluggyAuthClient(): PluggyAuthClient {
  const credentials = requirePluggyCredentials();

  return new PluggyAuthClient({
    baseUrl: env.PLUGGY_BASE_URL,
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    timeoutMs: env.PLUGGY_AUTH_TIMEOUT_MS,
    apiKeyTtlMs: env.PLUGGY_API_KEY_TTL_SECONDS * 1000,
    refreshSkewMs: env.PLUGGY_API_KEY_REFRESH_SKEW_SECONDS * 1000,
  });
}

export function createPluggyDataClient(): PluggyDataClient {
  const authClient = createPluggyAuthClient();
  const apiClient = new PluggyApiClient({
    baseUrl: env.PLUGGY_BASE_URL,
    authClient,
    timeoutMs: env.PLUGGY_DATA_TIMEOUT_MS,
  });
  return new PluggyDataClient(apiClient);
}

export function createPluggyTransactionRepository(): PluggyTransactionRepository {
  const references = getPluggyItemReferences();
  if (references.length === 0) {
    throw new Error(
      "PLUGGY_ITEM_IDS não configurado. Adicione os itemIds autorizados antes de criar o repositório Pluggy.",
    );
  }

  return new PluggyTransactionRepository(createPluggyDataClient(), {
    itemReferences: references,
    maxPages: env.PLUGGY_MAX_TRANSACTION_PAGES,
    timeZone: env.FINANCE_TIME_ZONE,
  });
}

export function getPluggyConfigurationStatus(): {
  configured: boolean;
  baseUrl: string;
  missing: string[];
} {
  const missing: string[] = [];
  if (!env.PLUGGY_CLIENT_ID) missing.push("PLUGGY_CLIENT_ID");
  if (!env.PLUGGY_CLIENT_SECRET) missing.push("PLUGGY_CLIENT_SECRET");

  return {
    configured: missing.length === 0,
    baseUrl: env.PLUGGY_BASE_URL,
    missing,
  };
}
