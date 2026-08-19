import { redactSensitiveText } from "../security/redaction.js";

export function safeErrorForLog(error: unknown): {
  name: string;
  message: string;
  code?: unknown;
  status?: unknown;
} {
  if (!(error instanceof Error)) {
    return {
      name: "UnknownError",
      message: redactSensitiveText(String(error)),
    };
  }

  const candidate = error as Error & { code?: unknown; status?: unknown };
  return {
    name: candidate.name,
    message: redactSensitiveText(candidate.message),
    code: candidate.code,
    status: candidate.status,
  };
}
