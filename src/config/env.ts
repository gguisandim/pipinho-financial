import "dotenv/config";
import { z } from "zod";

const optionalEnvString = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  },
  z.string().min(1).optional(),
);

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3333),

  GROQ_API_KEY: optionalEnvString,
  GROQ_MODEL: z.string().min(1).default("openai/gpt-oss-20b"),
  GROQ_STRUCTURED_MODEL: z.string().min(1).default("openai/gpt-oss-20b"),
  GROQ_TOOL_MODEL: z.string().min(1).default("openai/gpt-oss-20b"),
  GROQ_FINAL_MODEL: z.string().min(1).default("openai/gpt-oss-20b"),
  GROQ_AGENT_MODEL: z.string().min(1).default("openai/gpt-oss-20b"),

  OPENROUTER_API_KEY: optionalEnvString,
  OPENROUTER_AGENT_MODEL: z.string().min(1).default("openrouter/free"),
  OPENROUTER_FINAL_MODEL: z.string().min(1).default("openrouter/free"),
  OPENROUTER_TIMEOUT_MS: z.coerce.number().int().min(1000).default(120000),

  // Ciclo 6.1 — autenticação server-side da Pluggy.
  PLUGGY_CLIENT_ID: optionalEnvString,
  PLUGGY_CLIENT_SECRET: optionalEnvString,
  PLUGGY_BASE_URL: z.string().url().default("https://api.pluggy.ai"),
  PLUGGY_AUTH_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15000),
  // A documentação da Pluggy informa validade de 2h para a API Key.
  // Renovamos alguns minutos antes para evitar usar uma chave no limite.
  PLUGGY_API_KEY_TTL_SECONDS: z.coerce.number().int().min(60).default(7200),
  PLUGGY_API_KEY_REFRESH_SKEW_SECONDS: z.coerce.number().int().min(0).default(300),

  AGENT_MAX_ITERATIONS: z.coerce.number().int().min(1).max(10).default(5),
  AGENT_MAX_TOOL_CALLS: z.coerce.number().int().min(1).max(30).default(12),

  // Mantidos para compatibilidade com .env antigos.
  GROQ_AGENT_MAX_ITERATIONS: z.coerce.number().int().min(1).max(10).optional(),
  GROQ_AGENT_MAX_TOOL_CALLS: z.coerce.number().int().min(1).max(30).optional(),
});

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  AGENT_MAX_ITERATIONS:
    parsed.GROQ_AGENT_MAX_ITERATIONS ?? parsed.AGENT_MAX_ITERATIONS,
  AGENT_MAX_TOOL_CALLS:
    parsed.GROQ_AGENT_MAX_TOOL_CALLS ?? parsed.AGENT_MAX_TOOL_CALLS,
};

export function requireGroqApiKey(): string {
  if (!env.GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY não configurada. Copie .env.example para .env e adicione sua chave da Groq.",
    );
  }
  return env.GROQ_API_KEY;
}

export function requireOpenRouterApiKey(): string {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error(
      "OPENROUTER_API_KEY não configurada. Crie uma chave no OpenRouter e adicione ao .env.",
    );
  }
  return env.OPENROUTER_API_KEY;
}

export function requirePluggyCredentials(): {
  clientId: string;
  clientSecret: string;
} {
  const missing: string[] = [];
  if (!env.PLUGGY_CLIENT_ID) missing.push("PLUGGY_CLIENT_ID");
  if (!env.PLUGGY_CLIENT_SECRET) missing.push("PLUGGY_CLIENT_SECRET");

  if (missing.length > 0) {
    throw new Error(
      `${missing.join(" e ")} não configurada(s). Copie as credenciais da sua aplicação no Pluggy Dashboard e adicione-as ao .env.`,
    );
  }

  return {
    clientId: env.PLUGGY_CLIENT_ID as string,
    clientSecret: env.PLUGGY_CLIENT_SECRET as string,
  };
}
