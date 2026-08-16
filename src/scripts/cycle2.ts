import { GroqStructuredProvider } from "../llm/providers/groq-structured.provider.js";
import { StructuredFinancialInsightService } from "../services/structured-financial-insight.service.js";

const question =
  process.argv.slice(2).join(" ") ||
  "Analise meu fluxo financeiro e destaque os três pontos mais relevantes.";

const service = new StructuredFinancialInsightService(
  new GroqStructuredProvider(),
);

const result = await service.analyze(question);

console.log("=== CICLO 2: STRUCTURED OUTPUTS + ZOD ===");
console.log(`Pergunta: ${question}\n`);
console.log("--- objeto validado ---");
console.log(JSON.stringify(result.analysis, null, 2));
console.log("\n--- uso programático ---");
console.log(`status: ${result.analysis.status}`);
console.log(`insufficientData: ${result.analysis.status === "insufficient_data"}`);
console.log(`facts: ${result.analysis.facts.length}`);
console.log(`missingData: ${result.analysis.missingData.join(", ") || "nenhum"}`);
console.log(`confidence: ${result.analysis.confidence}`);
console.log("\n--- telemetria ---");
console.log(JSON.stringify(result.llm, null, 2));
