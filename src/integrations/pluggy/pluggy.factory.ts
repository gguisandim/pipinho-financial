import { env, requirePluggyCredentials } from "../../config/env.js";
import { PluggyAuthClient } from "./pluggy-auth.client.js";

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
