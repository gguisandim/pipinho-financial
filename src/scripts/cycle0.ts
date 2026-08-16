import { syntheticTransactions } from "../fixtures/synthetic-transactions.js";
import { summarizeTransactions } from "../financial-engine/summarize.js";

const summary = summarizeTransactions(syntheticTransactions);

console.log("=== CICLO 0: DATA + FINANCIAL ENGINE ===");
console.log(`Transações sintéticas: ${syntheticTransactions.length}`);
console.log(JSON.stringify(summary, null, 2));
