import { env, requireGroqApiKey, requireOpenRouterApiKey } from "../../config/env.js";
import { GroqProvider } from "../../llm/providers/groq.provider.js";
import { OpenRouterProvider } from "../../llm/providers/openrouter.provider.js";
import { GroqToolCallingProvider } from "../../llm/tool-calling/groq-tool-calling.provider.js";
import { OpenRouterToolCallingProvider } from "../../llm/tool-calling/openrouter-tool-calling.provider.js";
import { AgenticFinancialService } from "../../services/agentic-financial.service.js";
import type { BenchmarkProviderId } from "../benchmark.types.js";

export interface BenchmarkProviderBundle {
  id: BenchmarkProviderId;
  configuredModel: string;
  defaultDelayMs: number;
  service: AgenticFinancialService;
}

export function createBenchmarkProvider(options: {
  provider: BenchmarkProviderId;
  referenceDate: string;
}): BenchmarkProviderBundle {
  const { provider, referenceDate } = options;

  if (provider === "groq") {
    requireGroqApiKey();
    return {
      id: provider,
      configuredModel: env.GROQ_AGENT_MODEL,
      // O agente costuma consumir alguns milhares de tokens por caso. O delay
      // conserva TPM no free tier e torna o benchmark mais reprodutível.
      defaultDelayMs: 25000,
      service: new AgenticFinancialService(
        new GroqToolCallingProvider(env.GROQ_AGENT_MODEL),
        new GroqProvider(env.GROQ_FINAL_MODEL),
        { referenceDate },
      ),
    };
  }

  requireOpenRouterApiKey();
  return {
    id: provider,
    configuredModel: env.OPENROUTER_AGENT_MODEL,
    // OpenRouter/free tem limite diário próprio; um intervalo menor é suficiente
    // para evitar rajadas sem tornar o benchmark excessivamente lento.
    defaultDelayMs: 5000,
    service: new AgenticFinancialService(
      new OpenRouterToolCallingProvider(env.OPENROUTER_AGENT_MODEL),
      new OpenRouterProvider(env.OPENROUTER_FINAL_MODEL),
      { referenceDate },
    ),
  };
}

export async function checkProviderReadiness(provider: BenchmarkProviderId): Promise<{
  ready: boolean;
  message: string;
  setupHint?: string;
}> {
  if (provider === "groq") {
    return env.GROQ_API_KEY
      ? { ready: true, message: `Groq configurado (${env.GROQ_AGENT_MODEL}).` }
      : {
          ready: false,
          message: "GROQ_API_KEY não configurada.",
          setupHint: "Adicione GROQ_API_KEY ao arquivo .env.",
        };
  }

  return env.OPENROUTER_API_KEY
    ? { ready: true, message: `OpenRouter configurado (${env.OPENROUTER_AGENT_MODEL}).` }
    : {
        ready: false,
        message: "OPENROUTER_API_KEY não configurada.",
        setupHint:
          "Crie uma API key no painel do OpenRouter e adicione OPENROUTER_API_KEY ao .env. O modelo padrão openrouter/free não exige selecionar um modelo pago.",
      };
}
