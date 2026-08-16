import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3333),
  GROQ_API_KEY: z.string().min(1).optional(),
  GROQ_MODEL: z.string().min(1).default("openai/gpt-oss-20b"),
  GROQ_STRUCTURED_MODEL: z.string().min(1).default("openai/gpt-oss-20b"),
  GROQ_TOOL_MODEL: z.string().min(1).default("openai/gpt-oss-20b"),
  GROQ_FINAL_MODEL: z.string().min(1).default("llama-3.3-70b-versatile"),
});

export const env = envSchema.parse(process.env);

export function requireGroqApiKey(): string {
  if (!env.GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY não configurada. Copie .env.example para .env e adicione sua chave da Groq.",
    );
  }

  return env.GROQ_API_KEY;
}
