import { routeFinancialTools, selectFinancialToolDefinitions } from "../agent/financial-tool-router.js";
import { env, requireOpenRouterApiKey } from "../config/env.js";
import {
  realFinancialToolDefinitions,
  RealFinancialToolExecutor,
} from "../financial-tools/real-financial-tools.js";
import { createPluggyTransactionRepository } from "../integrations/pluggy/pluggy.factory.js";
import { buildRealFinancialAgentSystemPrompt } from "../llm/prompts/financial-real-agent.prompt.js";
import { OpenRouterProvider } from "../llm/providers/openrouter.provider.js";
import { OpenRouterToolCallingProvider } from "../llm/tool-calling/openrouter-tool-calling.provider.js";
import { AgenticFinancialService } from "./agentic-financial.service.js";
import { createGroqRealFinancialAgentService } from "./real-financial-agent-groq.factory.js";
import { RealFinancialDataService } from "./real-financial-data.service.js";

export type RealFinancialAgentProvider = "groq" | "openrouter";

function deterministicToolPlan(question: string) {
  const decision = routeFinancialTools(question);
  if (decision.intent === "general" ||
    decision.intent === "conversation" ||
    decision.toolNames.length !== 1 ||
    decision.toolNames[0] === "search_transactions" ||
    decision.toolNames[0] === "get_event_day_spending") {
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

  if (provider === "groq") {
    return createGroqRealFinancialAgentService({
      referenceDate: options.referenceDate,
    });
  }

  requireOpenRouterApiKey();
  const repository = createPluggyTransactionRepository();
  const data = new RealFinancialDataService(repository);
  const toolExecutor = new RealFinancialToolExecutor(data);

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
