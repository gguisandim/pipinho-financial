import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Arquivos removidos definitivamente da arquitetura atual. Este script existe
// para quem atualiza o projeto por sobreposição de ZIP e pode manter arquivos
// antigos fisicamente no workspace.
const stalePaths = [
  "src/routes/ai.routes.ts",
  "src/routes/finance.routes.ts",
  "src/evaluation/benchmark.cases.ts",
  "src/evaluation/benchmark.comparison.ts",
  "src/evaluation/benchmark.errors.ts",
  "src/evaluation/benchmark.runner.ts",
  "src/evaluation/providers/provider.factory.ts",
  "src/llm/prompts/financial-structured.prompt.ts",
  "src/llm/prompts/financial-summary.prompt.ts",
  "src/repositories/synthetic-transaction.repository.ts",
  "src/scripts/cycle0.ts",
  "src/scripts/cycle1.ts",
  "src/scripts/cycle2.ts",
  "src/scripts/cycle3.ts",
  "src/scripts/cycle4.ts",
  "src/scripts/cycle5a.ts",
  "src/scripts/cycle5b.ts",
  "src/scripts/cycle6-1.ts",
  "src/scripts/cycle6-2.ts",
  "src/scripts/cycle6-3.ts",
  "src/scripts/cycle6-4.ts",
  "src/scripts/providers.ts",
  "src/services/financial-insight.service.ts",
  "src/services/structured-financial-insight.service.ts",
];

let removed = 0;
for (const relativePath of stalePaths) {
  const target = resolve(root, relativePath);
  try {
    await rm(target, { force: true, recursive: true });
    removed += 1;
  } catch {
    // rm(force) já tolera ausentes; este catch só mantém o cleanup não-bloqueante.
  }
}

console.log(`[clean:stale] lista verificada: ${stalePaths.length}; workspace limpo.`);
