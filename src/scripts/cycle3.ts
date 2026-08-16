import { GroqToolCallingProvider } from "../llm/tool-calling/groq-tool-calling.provider.js";
import { ToolCallingFinancialService } from "../services/tool-calling-financial.service.js";

const question =
  process.argv.slice(2).join(" ") ||
  "Analise meu fluxo financeiro e destaque os três pontos mais relevantes.";

const service = new ToolCallingFinancialService(new GroqToolCallingProvider());
const result = await service.answer(question);

console.log("=== CICLO 3: LOCAL TOOL CALLING ===");
console.log(`Pergunta: ${question}\n`);

console.log("--- ferramentas executadas ---");
if (result.toolCalls.length === 0) {
  console.log("nenhuma");
} else {
  for (const [index, tool] of result.toolCalls.entries()) {
    console.log(`\n[${index + 1}] ${tool.name}`);
    console.log("argumentos:");
    console.log(JSON.stringify(tool.arguments, null, 2));
    console.log("resultado do backend:");
    console.log(JSON.stringify(tool.result, null, 2));
  }
}

console.log("\n--- resposta final ---");
console.log(result.answer);

console.log("\n--- telemetria ---");
console.log(JSON.stringify(result.llm, null, 2));
