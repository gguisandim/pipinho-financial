import { env } from "../config/env.js";
import { GroqProvider } from "../llm/providers/groq.provider.js";
import { GroqToolCallingProvider } from "../llm/tool-calling/groq-tool-calling.provider.js";
import { AgenticFinancialService } from "../services/agentic-financial.service.js";

const question =
  process.argv.slice(2).join(" ") ||
  "Analise meu fluxo financeiro e destaque os três pontos mais relevantes.";

const service = new AgenticFinancialService(
  new GroqToolCallingProvider(env.GROQ_AGENT_MODEL),
  new GroqProvider(env.GROQ_FINAL_MODEL),
);

const result = await service.answer(question);

console.log("=== CICLO 4: AGENT LOOP CONTROLADO ===");
console.log(`Pergunta: ${question}`);
console.log(`Data de referência: ${result.referenceDate}\n`);

console.log("--- passos do agente ---");
for (const turn of result.turns) {
  console.log(
    `\nIteração ${turn.iteration} | tool calls: ${turn.toolCallCount} | ${turn.latencyMs} ms | finish=${turn.finishReason}`,
  );

  const iterationTools = result.toolCalls.filter(
    (tool) => tool.iteration === turn.iteration,
  );

  for (const tool of iterationTools) {
    console.log(`  → ${tool.name} [${tool.outcome}]`);
    console.log(`    argumentos: ${JSON.stringify(tool.arguments)}`);
    console.log(`    resultado: ${JSON.stringify(tool.result)}`);
  }
}

console.log("\n--- resposta final ---");
console.log(result.answer);

console.log("\n--- causal grounding ---");
console.log(JSON.stringify(result.grounding.causal, null, 2));

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
