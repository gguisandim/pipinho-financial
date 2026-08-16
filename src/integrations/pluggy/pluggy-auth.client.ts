import { z } from "zod";

const pluggyAuthResponseSchema = z.object({
  apiKey: z.string().min(1),
});

export type PluggyAuthSource = "network" | "cache";

export interface PluggyApiKeySession {
  apiKey: string;
  source: PluggyAuthSource;
  createdAt: Date;
  expiresAt: Date;
}

export interface PluggyAuthClientConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  timeoutMs?: number;
  apiKeyTtlMs?: number;
  refreshSkewMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class PluggyAuthError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: "invalid_credentials" | "invalid_response" | "http_error" | "network_error",
  ) {
    super(message);
    this.name = "PluggyAuthError";
  }
}

interface CachedApiKey {
  apiKey: string;
  createdAtMs: number;
  expiresAtMs: number;
}

function authEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/auth`;
}

export class PluggyAuthClient {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly apiKeyTtlMs: number;
  private readonly refreshSkewMs: number;
  private cache: CachedApiKey | null = null;

  constructor(private readonly config: PluggyAuthClientConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? Date.now;
    this.timeoutMs = config.timeoutMs ?? 15_000;
    this.apiKeyTtlMs = config.apiKeyTtlMs ?? 2 * 60 * 60 * 1000;
    this.refreshSkewMs = config.refreshSkewMs ?? 5 * 60 * 1000;
  }

  async getApiKey(options: { forceRefresh?: boolean } = {}): Promise<PluggyApiKeySession> {
    const nowMs = this.now();

    if (
      !options.forceRefresh &&
      this.cache &&
      nowMs < this.cache.expiresAtMs - this.refreshSkewMs
    ) {
      return this.sessionFromCache(this.cache, "cache");
    }

    return this.authenticate();
  }

  clearCache(): void {
    this.cache = null;
  }

  private sessionFromCache(cache: CachedApiKey, source: PluggyAuthSource): PluggyApiKeySession {
    return {
      apiKey: cache.apiKey,
      source,
      createdAt: new Date(cache.createdAtMs),
      expiresAt: new Date(cache.expiresAtMs),
    };
  }

  private async authenticate(): Promise<PluggyApiKeySession> {
    let response: Response;

    try {
      response = await this.fetchImpl(authEndpoint(this.config.baseUrl), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: this.config.clientId,
          clientSecret: this.config.clientSecret,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new PluggyAuthError(
        `Falha de rede ao autenticar na Pluggy: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        "network_error",
      );
    }

    const raw = await response.text();
    let json: unknown = {};

    try {
      json = raw ? JSON.parse(raw) : {};
    } catch {
      if (response.ok) {
        throw new PluggyAuthError(
          "A Pluggy respondeu com sucesso HTTP, mas o corpo de autenticação não era JSON válido.",
          response.status,
          "invalid_response",
        );
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new PluggyAuthError(
          "A Pluggy rejeitou PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET. Confira as credenciais no Dashboard.",
          401,
          "invalid_credentials",
        );
      }

      throw new PluggyAuthError(
        `A Pluggy retornou HTTP ${response.status} durante a autenticação.`,
        response.status,
        "http_error",
      );
    }

    const parsed = pluggyAuthResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new PluggyAuthError(
        "Resposta de autenticação da Pluggy não contém uma apiKey válida.",
        response.status,
        "invalid_response",
      );
    }

    const createdAtMs = this.now();
    this.cache = {
      apiKey: parsed.data.apiKey,
      createdAtMs,
      expiresAtMs: createdAtMs + this.apiKeyTtlMs,
    };

    return this.sessionFromCache(this.cache, "network");
  }
}
