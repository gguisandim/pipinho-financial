import { benchmarkCases } from "../evaluation/benchmark.cases.js";
import { runBenchmark } from "../evaluation/benchmark.runner.js";

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const runs = Number(valueAfter("--runs") ?? "1");
const delayMs = Number(valueAfter("--delay-ms") ?? "25000");
const caseFilter = valueAfter("--case");

if (process.argv.includes("--list")) {
  console.log("Casos disponíveis:");
  for (const testCase of benchmarkCases) {
    console.log(`- ${testCase.id}: ${testCase.description}`);
  }
  process.exit(0);
}

if (!Number.isInteger(runs) || runs < 1 || runs > 10) {
  throw new Error("--runs deve ser um inteiro entre 1 e 10.");
}
if (!Number.isFinite(delayMs) || delayMs < 0) {
  throw new Error("--delay-ms deve ser um número >= 0.");
}

console.log("=== CICLO 5A: EVALUATION HARNESS ===");
console.log(`runs: ${runs}`);
console.log(`delay: ${delayMs} ms`);
console.log(`cases: ${caseFilter ?? "todos"}\n`);

const startedAt = Date.now();

const { report, paths } = await runBenchmark({
  runs,
  delayMs,
  caseIds: caseFilter ? caseFilter.split(",").map((value) => value.trim()) : undefined,
  onProgress: (event) => {
    if (event.phase === "case_start") {
      console.log(`[${event.current}/${event.total}] Executando ${event.caseId}...`);
      return;
    }

    if (event.phase === "case_complete") {
      const status = event.passed ? "✓" : "✗";
      const tokens = event.tokens ?? 0;
      console.log(`    ${status} concluído em ${event.latencyMs ?? 0} ms | ${tokens} tokens`);
      return;
    }

    if (event.phase === "rate_limit") {
      console.log(`    429: aguardando ${Math.ceil((event.waitMs ?? 0) / 1000)} s para retry...`);
      return;
    }

    if (event.phase === "delay") {
      console.log(`    aguardando ${Math.ceil((event.waitMs ?? 0) / 1000)} s antes do próximo caso...\n`);
    }
  },
});

console.log(`\nBenchmark concluído em ${Math.round((Date.now() - startedAt) / 1000)} s.\n`);

const s = report.summary;
console.log("--- resumo ---");
console.log(`Pass rate:                 ${s.passRatePct}% (${s.passed}/${s.executionCount})`);
console.log(`Tool selection accuracy:   ${s.toolSelectionAccuracyPct}%`);
console.log(`Argument accuracy:         ${s.argumentAccuracyPct}%`);
console.log(`Grounding accuracy:        ${s.groundingAccuracyPct}%`);
console.log(`Causal repair rate:        ${s.causalRepairRatePct}%`);
console.log(`Answer requirements:       ${s.answerRequirementAccuracyPct}%`);
console.log(`Iterações médias:          ${s.averageIterations}`);
console.log(`Tools médias:              ${s.averageToolCalls}`);
console.log(`Latência média:            ${s.averageLatencyMs} ms`);
console.log(`P50 / P95:                 ${s.p50LatencyMs} / ${s.p95LatencyMs} ms`);
console.log(`Tokens médios:             ${s.averageTokens}`);
console.log(`Tokens totais:             ${s.totalTokens}`);

console.log("\n--- casos ---");
for (const result of report.results) {
  console.log(
    `${result.score.passed ? "✓" : "✗"} ${result.caseId}#${result.run} | tools=${Math.round(result.score.toolSelection * 100)}% args=${Math.round(result.score.argumentAccuracy * 100)}% grounding=${Math.round(result.score.grounding * 100)}% | ${result.latencyMs}ms | ${result.tokens ?? 0} tokens`,
  );
  if (!result.score.passed) {
    for (const failure of result.score.failures) console.log(`    - ${failure}`);
  }
}

console.log("\n--- relatórios ---");
console.log(paths.latestMd);
console.log(paths.latestJson);
