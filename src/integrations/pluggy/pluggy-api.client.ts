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
  fetchImpl?: typeof fetch;
}

function buildUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export class PluggyApiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly config: PluggyApiClientConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  async getJson<T>(path: string): Promise<T> {
    return this.requestJson<T>("GET", path);
  }

  private async requestJson<T>(
    method: "GET",
    path: string,
    options: { retriedAuth?: boolean } = {},
  ): Promise<T> {
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
      throw new PluggyApiError(
        `Falha de rede ao consultar a Pluggy: ${
          error instanceof Error ? error.message : String(error)
        }`,
        undefined,
        "network_error",
      );
    }

    // Uma API Key pode expirar entre o cache local e o request. Renovamos uma vez.
    if (response.status === 401 && !options.retriedAuth) {
      this.config.authClient.clearCache();
      return this.requestJson<T>(method, path, { retriedAuth: true });
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
        `A Pluggy retornou HTTP ${response.status} para GET ${path}.`,
        response.status,
        code,
        body,
      );
    }

    return body as T;
  }
}
