import { createPluggyTransactionRepository } from "../integrations/pluggy/pluggy.factory.js";
import { auditRealSnapshot } from "../quality/real-data-audit.js";

console.log("=== QA REAL: INVARIANTES FINANCEIROS ===");
console.log("LLM: não utilizado");
console.log("Valores financeiros: não exibidos\n");

const repository = createPluggyTransactionRepository();
const snapshot = await repository.listTransactions({ includePending: false });
const audit = auditRealSnapshot(snapshot);

for (const check of audit.checks) {
  const marker = check.status === "pass" ? "✓" : check.status === "warn" ? "!" : "✗";
  console.log(`${marker} [${check.status.toUpperCase()}] ${check.id}: ${check.message}`);
}

console.log("\n--- RESUMO ---");
console.log(`PASS: ${audit.summary.pass}`);
console.log(`WARN: ${audit.summary.warn}`);
console.log(`FAIL: ${audit.summary.fail}`);
console.log(`Transactions: ${snapshot.transactions.length}`);
console.log(`Source: ${snapshot.source}`);

if (audit.summary.fail > 0) {
  console.error("\nQA real falhou. Não avance o ciclo antes de revisar os checks FAIL.");
  process.exitCode = 1;
} else {
  console.log("\nQA real aprovado: nenhum erro de integridade detectado. WARNs representam limitações conhecidas de qualidade.");
}
