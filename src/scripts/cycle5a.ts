import { benchmarkCases } from "../evaluation/benchmark.cases.js";
import { runBenchmark } from "../evaluation/benchmark.runner.js";
import { checkProviderReadiness } from "../evaluation/providers/provider.factory.js";
import type {
  BenchmarkExecutionStatus,
  BenchmarkProviderId,
} from "../evaluation/benchmark.types.js";

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseProvider(value: string | undefined): BenchmarkProviderId {
  const provider = value ?? "groq";
  if (provider !== "groq" && provider !== "openrouter") {
    throw new Error("--provider deve ser groq ou openrouter.");
  }
  return provider;
}

function statusSymbol(status: BenchmarkExecutionStatus | undefined, passed?: boolean) {
  if (status === "provider_error") return "⚠ provider";
  if (status === "model_protocol_error") return "⚠ protocol";
  if (status === "harness_error") return "⚠ harness";
  return passed ? "✓" : "✗";
}

async function main() {
  const runs = Number(valueAfter("--runs") ?? "1");
  const delayFlag = valueAfter("--delay-ms");
  const delayMs = delayFlag === undefined ? undefined : Number(delayFlag);
  const caseFilter = valueAfter("--case");
  const provider = parseProvider(valueAfter("--provider"));

  if (process.argv.includes("--list")) {
    console.log("Casos disponíveis:");
    for (const testCase of benchmarkCases) {
      console.log(`- ${testCase.id}: ${testCase.description}`);
    }
    return;
  }

  if (process.argv.includes("--list-providers")) {
    console.log("Providers suportados: groq, openrouter");
    return;
  }

  if (!Number.isInteger(runs) || runs < 1 || runs > 10) {
    throw new Error("--runs deve ser um inteiro entre 1 e 10.");
  }
  if (delayMs !== undefined && (!Number.isFinite(delayMs) || delayMs < 0)) {
    throw new Error("--delay-ms deve ser um número >= 0.");
  }

  const readiness = await checkProviderReadiness(provider);
  if (!readiness.ready) {
    console.error(`Provider ${provider} não está pronto: ${readiness.message}`);
    if (readiness.setupHint) console.error(`Configuração: ${readiness.setupHint}`);
    console.error("Nenhum benchmark foi executado.");
    process.exitCode = 2;
    return;
  }

  console.log("=== CICLO 5A/5B: EVALUATION HARNESS ===");
  console.log(`provider: ${provider}`);
  console.log(`status: ${readiness.message}`);
  console.log(`runs: ${runs}`);
  console.log(`delay: ${delayMs === undefined ? "padrão do provider" : `${delayMs} ms`}`);
  console.log(`cases: ${caseFilter ?? "todos"}\n`);

  const startedAt = Date.now();

  const { report, paths } = await runBenchmark({
    provider,
    runs,
    delayMs,
    caseIds: caseFilter ? caseFilter.split(",").map((value) => value.trim()) : undefined,
    onProgress: (event) => {
      if (event.phase === "case_start") {
        console.log(
          `[${event.current}/${event.total}] [${event.provider}] Executando ${event.caseId}...`,
        );
        return;
      }

      if (event.phase === "case_complete") {
        const status = statusSymbol(event.executionStatus, event.passed);
        const tokens = event.tokens === null || event.tokens === undefined ? "n/d" : event.tokens;
        const latency = event.latencyMs && event.latencyMs > 0 ? `${event.latencyMs} ms` : "n/d";
        console.log(`    ${status} | ${latency} | ${tokens} tokens`);
        if (event.error) console.log(`    erro: ${event.error}`);
        return;
      }

      if (event.phase === "rate_limit") {
        console.log(
          `    429: aguardando ${Math.ceil((event.waitMs ?? 0) / 1000)} s para retry...`,
        );
        return;
      }

      if (event.phase === "delay") {
        console.log(
          `    aguardando ${Math.ceil((event.waitMs ?? 0) / 1000)} s antes do próximo caso...\n`,
        );
      }
    },
  });

  console.log(
    `\nBenchmark concluído em ${Math.round((Date.now() - startedAt) / 1000)} s.\n`,
  );

  const s = report.summary;
  console.log("--- resumo ---");
  console.log(`Provider:                  ${s.provider}`);
  console.log(`Modelo configurado:        ${s.configuredModel}`);
  console.log(`Modelos observados:        ${s.observedModels.join(", ") || "nenhum"}`);
  console.log(`Execuções solicitadas:     ${s.executionCount}`);
  console.log(`Execuções completas:       ${s.completedExecutions}`);
  console.log(`Protocol errors:           ${s.modelProtocolErrors}`);
  console.log(`Provider errors:           ${s.providerErrors}`);
  console.log(`Harness errors:            ${s.harnessErrors}`);
  console.log(`Provider availability:     ${s.providerAvailabilityPct}%`);
  console.log(`Execuções avaliáveis:      ${s.qualityExecutionCount}`);
  console.log(`Pass rate:                 ${s.passRatePct}% (${s.passed}/${s.qualityExecutionCount})`);
  console.log(`Tool selection accuracy:   ${s.toolSelectionAccuracyPct}%`);
  console.log(`Argument accuracy:         ${s.argumentAccuracyPct}%`);
  console.log(`Grounding accuracy:        ${s.groundingAccuracyPct}%`);
  console.log(`Causal repair rate:        ${s.causalRepairRatePct}%`);
  console.log(`Semantic answer accuracy:  ${s.semanticAnswerAccuracyPct}%`);
  console.log(`Numeric answer accuracy:   ${s.numericAnswerAccuracyPct}%`);
  console.log(`Answer requirements:       ${s.answerRequirementAccuracyPct}%`);
  console.log(`Iterações médias:          ${s.averageIterations}`);
  console.log(`Tools médias:              ${s.averageToolCalls}`);
  console.log(`Latência média:            ${s.averageLatencyMs} ms`);
  console.log(`P50 / P95:                 ${s.p50LatencyMs} / ${s.p95LatencyMs} ms`);
  console.log(`Cobertura de tokens:       ${s.tokenCoveragePct}%`);
  console.log(`Tokens médios:             ${s.averageTokens ?? "n/d"}`);
  console.log(`Tokens totais:             ${s.totalTokens ?? "n/d"}`);

  console.log("\n--- casos ---");
  for (const result of report.results) {
    const status = statusSymbol(result.executionStatus, result.score.passed);
    console.log(
      `${status} ${result.caseId}#${result.run} [${result.executionStatus}] | tools=${Math.round(result.score.toolSelection * 100)}% args=${Math.round(result.score.argumentAccuracy * 100)}% grounding=${Math.round(result.score.grounding * 100)}% semantic=${Math.round(result.score.semanticAnswer * 100)}% numeric=${Math.round(result.score.numericAnswer * 100)}% | ${result.latencyMs > 0 ? `${result.latencyMs}ms` : "n/d"} | ${result.tokens ?? "n/d"} tokens`,
    );
    if (result.error) console.log(`    - error: ${result.error}`);
    if (result.executionStatus === "completed" && !result.score.passed) {
      for (const failure of result.score.failures) console.log(`    - ${failure}`);
    }
  }

  console.log("\n--- relatórios ---");
  console.log(paths.latestMd);
  console.log(paths.latestJson);
}

main().catch((error) => {
  console.error(`Erro no benchmark: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
