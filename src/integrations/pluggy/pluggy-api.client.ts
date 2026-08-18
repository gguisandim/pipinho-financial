import { PluggyAuthClient } from "./pluggy-auth.client.js";

export type PluggyApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_response"
  | "http_error"
  | "network_error";

export class PluggyApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: PluggyApiErrorCode,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "PluggyApiError";
  }
}

export interface PluggyApiClientConfig {
  baseUrl: string;
  authClient: PluggyAuthClient;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
  fetchImpl?: typeof fetch;
}

function buildUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(response: Response): number | null {
  const raw = response.headers.get("retry-after");
  if (!raw) return null;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);

  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

function isTransientStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export class PluggyApiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;

  constructor(private readonly config: PluggyApiClientConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.maxRetries = Math.max(0, config.maxRetries ?? 2);
    this.retryBaseMs = Math.max(100, config.retryBaseMs ?? 500);
  }

  async getJson<T>(path: string): Promise<T> {
    return this.requestJson<T>("GET", path);
  }

  private async requestJson<T>(
    method: "GET",
    path: string,
    options: { retriedAuth?: boolean; attempt?: number } = {},
  ): Promise<T> {
    const attempt = options.attempt ?? 0;
    const session = await this.config.authClient.getApiKey({
      forceRefresh: options.retriedAuth === true,
    });

    let response: Response;

    try {
      response = await this.fetchImpl(buildUrl(this.config.baseUrl, path), {
        method,
        headers: {
          Accept: "application/json",
          "X-API-KEY": session.apiKey,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (attempt < this.maxRetries) {
        await sleep(this.retryBaseMs * 2 ** attempt);
        return this.requestJson<T>(method, path, {
          ...options,
          attempt: attempt + 1,
        });
      }

      throw new PluggyApiError(
        `Falha de rede ao consultar a Pluggy após ${attempt + 1} tentativa(s): ${
          error instanceof Error ? error.message : String(error)
        }`,
        undefined,
        "network_error",
      );
    }

    // Uma API Key pode expirar entre o cache local e o request. Renovamos uma vez.
    if (response.status === 401 && !options.retriedAuth) {
      this.config.authClient.clearCache();
      return this.requestJson<T>(method, path, {
        retriedAuth: true,
        attempt,
      });
    }

    if (isTransientStatus(response.status) && attempt < this.maxRetries) {
      const retryAfter = parseRetryAfterMs(response);
      await sleep(retryAfter ?? this.retryBaseMs * 2 ** attempt);
      return this.requestJson<T>(method, path, {
        ...options,
        attempt: attempt + 1,
      });
    }

    const raw = await response.text();
    let body: unknown = null;

    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        if (response.ok) {
          throw new PluggyApiError(
            "A Pluggy retornou HTTP de sucesso, mas a resposta não era JSON válido.",
            response.status,
            "invalid_response",
          );
        }
      }
    }

    if (!response.ok) {
      const code: PluggyApiErrorCode =
        response.status === 401
          ? "unauthorized"
          : response.status === 403
            ? "forbidden"
            : response.status === 404
              ? "not_found"
              : "http_error";

      throw new PluggyApiError(
        `A Pluggy retornou HTTP ${response.status} para GET ${path} após ${attempt + 1} tentativa(s).`,
        response.status,
        code,
        body,
      );
    }

    return body as T;
  }
}
