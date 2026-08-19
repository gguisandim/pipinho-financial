import { env, requireGroqApiKey, requireOpenRouterApiKey } from "../config/env.js";
import { realFinancialToolDefinitions, RealFinancialToolExecutor } from "../financial-tools/real-financial-tools.js";
import { createPluggyTransactionRepository } from "../integrations/pluggy/pluggy.factory.js";
import { routeFinancialTools, selectFinancialToolDefinitions } from "../agent/financial-tool-router.js";
import { buildRealFinancialAgentSystemPrompt } from "../llm/prompts/financial-real-agent.prompt.js";
import { GroqProvider } from "../llm/providers/groq.provider.js";
import { OpenRouterProvider } from "../llm/providers/openrouter.provider.js";
import { GroqToolCallingProvider } from "../llm/tool-calling/groq-tool-calling.provider.js";
import { OpenRouterToolCallingProvider } from "../llm/tool-calling/openrouter-tool-calling.provider.js";
import { AgenticFinancialService } from "./agentic-financial.service.js";
import { RealFinancialDataService } from "./real-financial-data.service.js";

export type RealFinancialAgentProvider = "groq" | "openrouter";

function deterministicToolPlan(question: string) {
  const decision = routeFinancialTools(question);
  if (decision.intent === "general" || decision.toolNames.length !== 1) {
    return null;
  }

  return {
    name: decision.toolNames[0]!,
    rawArguments: "{}",
  };
}

export function createRealFinancialAgentService(options: {
  provider?: RealFinancialAgentProvider;
  referenceDate?: string;
} = {}) {
  const provider = options.provider ?? "groq";
  const repository = createPluggyTransactionRepository();
  const data = new RealFinancialDataService(repository);
  const toolExecutor = new RealFinancialToolExecutor(data);

  if (provider === "openrouter") {
    requireOpenRouterApiKey();
    return new AgenticFinancialService(
      new OpenRouterToolCallingProvider(env.OPENROUTER_AGENT_MODEL),
      new OpenRouterProvider(env.OPENROUTER_FINAL_MODEL),
      {
        referenceDate: options.referenceDate,
        toolDefinitions: realFinancialToolDefinitions,
        toolDefinitionsSelector: (question, definitions) =>
          selectFinancialToolDefinitions(question, definitions).tools,
        toolExecutor: (name, rawArguments) => toolExecutor.execute(name, rawArguments),
        systemPromptBuilder: buildRealFinancialAgentSystemPrompt,
        deterministicToolPlanner: (question) => deterministicToolPlan(question),
      },
    );
  }

  requireGroqApiKey();
  return new AgenticFinancialService(
    new GroqToolCallingProvider(env.GROQ_AGENT_MODEL),
    new GroqProvider(env.GROQ_FINAL_MODEL),
    {
      referenceDate: options.referenceDate,
      toolDefinitions: realFinancialToolDefinitions,
      toolDefinitionsSelector: (question, definitions) =>
        selectFinancialToolDefinitions(question, definitions).tools,
      toolExecutor: (name, rawArguments) => toolExecutor.execute(name, rawArguments),
      systemPromptBuilder: buildRealFinancialAgentSystemPrompt,
      deterministicToolPlanner: (question) => deterministicToolPlan(question),
    },
  );
}
