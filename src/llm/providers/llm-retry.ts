export interface LlmRetryOptions {
  maxRetries: number;
  baseDelayMs: number;
}

interface ErrorLike {
  status?: number;
  headers?: { get?: (name: string) => string | null };
  message?: string;
  name?: string;
  cause?: unknown;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusFromError(error: unknown): number | null {
  const candidate = error as ErrorLike;
  return typeof candidate?.status === "number" ? candidate.status : null;
}

function messageFromError(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` ${error.cause.message}` : "";
    return `${error.name} ${error.message}${cause}`.toLowerCase();
  }
  return String(error).toLowerCase();
}

function retryAfterMs(error: unknown): number | null {
  const candidate = error as ErrorLike;
  const raw = candidate?.headers?.get?.("retry-after");
  if (!raw) return null;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000);
  }

  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

export function isTransientLlmError(error: unknown): boolean {
  const status = statusFromError(error);
  if (status !== null) {
    if (status === 408 || status === 409 || status === 425 || status === 429) return true;
    if (status >= 500 && status <= 599) return true;
    // 400/tool_use_failed/json_validate_failed são erros de protocolo/modelo,
    // não indisponibilidade transitória: não escondemos esses casos com retry.
    return false;
  }

  const message = messageFromError(error);
  return /connection error|network|fetch failed|socket|econnreset|econnrefused|etimedout|timeout|timed out|temporar|service unavailable|upstream/.test(
    message,
  );
}

export async function withLlmRetry<T>(
  operation: () => Promise<T>,
  options: LlmRetryOptions,
): Promise<T> {
  const maxRetries = Math.max(0, options.maxRetries);
  const baseDelayMs = Math.max(50, options.baseDelayMs);

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientLlmError(error) || attempt >= maxRetries) throw error;

      const providerDelay = retryAfterMs(error);
      const exponential = baseDelayMs * 2 ** attempt;
      // Jitter pequeno evita que uma matriz de QA repita várias chamadas no
      // mesmo instante depois de 429/5xx.
      const jitter = Math.floor(Math.random() * Math.max(50, baseDelayMs / 4));
      await sleep(providerDelay ?? exponential + jitter);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
