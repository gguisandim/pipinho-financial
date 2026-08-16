import { GroqProvider } from "../llm/providers/groq.provider.js";
import { FinancialInsightService } from "../services/financial-insight.service.js";

const question = process.argv.slice(2).join(" ") || "Analise meu fluxo financeiro e destaque os três pontos mais relevantes.";

const service = new FinancialInsightService(new GroqProvider());
const result = await service.explain(question);

console.log("=== CICLO 1: PRIMEIRA CHAMADA LLM ===");
console.log(`Pergunta: ${question}\n`);
console.log(result.answer);
console.log("\n--- telemetria ---");
console.log(JSON.stringify(result.llm, null, 2));
