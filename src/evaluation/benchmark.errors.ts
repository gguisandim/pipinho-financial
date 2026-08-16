import type { BenchmarkExecutionStatus } from "./benchmark.types.js";

interface ErrorShape {
  status?: number;
  code?: string;
  cause?: { code?: string };
  error?: {
    error?: {
      code?: string;
      type?: string;
      message?: string;
    };
  };
  body?: unknown;
  message?: string;
}

function nestedCode(error: ErrorShape): string | undefined {
  return error.error?.error?.code ?? error.code ?? error.cause?.code;
}

export function classifyBenchmarkError(error: unknown): BenchmarkExecutionStatus {
  const candidate = error as ErrorShape;
  const code = nestedCode(candidate);
  const status = candidate.status;
  const message = error instanceof Error ? error.message : String(error);

  // tool_use_failed é uma falha de protocolo gerada pelo modelo. Se a camada
  // de recuperação não conseguiu tratá-la, isso deve contar como qualidade do
  // modelo, e não como indisponibilidade do provider.
  if (code === "tool_use_failed" || /tool_use_failed/i.test(message)) {
    return "model_protocol_error";
  }

  // Rate limit, autenticação, indisponibilidade e erros HTTP 5xx são externos
  // à qualidade semântica do agente. Permanecem visíveis, mas não derrubam as
  // métricas de accuracy.
  if (
    status === 401 ||
    status === 403 ||
    status === 408 ||
    status === 409 ||
    status === 429 ||
    (typeof status === "number" && status >= 500) ||
    /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|timeout|rate.?limit/i.test(message)
  ) {
    return "provider_error";
  }

  return "harness_error";
}
