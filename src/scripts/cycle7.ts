import { createRealFinancialAgentService, type RealFinancialAgentProvider } from "../services/real-financial-agent.factory.js";

const rawArgs = process.argv.slice(2);
const providerArgIndex = rawArgs.indexOf("--provider");
let provider: RealFinancialAgentProvider = "groq";
if (providerArgIndex >= 0) {
  const candidate = rawArgs[providerArgIndex + 1];
  if (candidate === "groq" || candidate === "openrouter") provider = candidate;
  rawArgs.splice(providerArgIndex, 2);
}

const showToolResultsIndex = rawArgs.indexOf("--show-tool-results");
const showToolResults = showToolResultsIndex >= 0;
if (showToolResultsIndex >= 0) rawArgs.splice(showToolResultsIndex, 1);

const question =
  rawArgs.join(" ").trim() ||
  "Analise meus gastos no período disponível e destaque os pontos mais relevantes, respeitando as limitações de qualidade dos dados.";

const service = createRealFinancialAgentService({ provider });
const result = await service.answer(question);

console.log("=== CICLO 7: REAL FINANCIAL AGENT ===");
console.log(`Provider: ${provider}`);
console.log(`Pergunta: ${question}`);
console.log(`Data de referência: ${result.referenceDate}\n`);

console.log("--- passos do agente ---");
for (const turn of result.turns) {
  console.log(
    `\nIteração ${turn.iteration} | tool calls: ${turn.toolCallCount} | ${turn.latencyMs} ms | finish=${turn.finishReason}`,
  );
  const tools = result.toolCalls.filter((tool) => tool.iteration === turn.iteration);
  for (const tool of tools) {
    console.log(`  → ${tool.name} [${tool.outcome}]`);
    console.log(`    argumentos: ${JSON.stringify(tool.arguments)}`);
    if (showToolResults) {
      console.log(`    resultado: ${JSON.stringify(tool.result)}`);
    } else {
      const resultObject =
        tool.result && typeof tool.result === "object" && !Array.isArray(tool.result)
          ? (tool.result as Record<string, unknown>)
          : {};
      console.log(
        `    resultado: status=${String(resultObject.status ?? "ok")} source=${String(resultObject.source ?? "local")}`,
      );
    }
  }
}

console.log("\n--- resposta final ---");
console.log(result.answer);

console.log("\n--- grounding ---");
console.log(JSON.stringify(result.grounding, null, 2));

console.log("\n--- controle do loop ---");
console.log(
  JSON.stringify(
    {
      termination: result.termination,
      iterations: result.iterations,
      toolCalls: result.toolCalls.length,
    },
    null,
    2,
  ),
);

console.log("\n--- telemetria ---");
console.log(JSON.stringify(result.llm, null, 2));

console.log("\nObservação: o LLM recebeu somente resultados de tools, não o extrato Pluggy completo.");
