import { runBenchmark } from "../evaluation/benchmark.runner.js";
import { writeBenchmarkComparison } from "../evaluation/benchmark.comparison.js";
import { checkProviderReadiness } from "../evaluation/providers/provider.factory.js";
import type { BenchmarkProviderId, BenchmarkReport } from "../evaluation/benchmark.types.js";

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseProviders(raw: string | undefined): BenchmarkProviderId[] {
  const values = (raw ?? "groq,openrouter")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const providers: BenchmarkProviderId[] = [];
  for (const value of values) {
    if (value !== "groq" && value !== "openrouter") {
      throw new Error(`Provider inválido: ${value}. Use groq ou openrouter.`);
    }
    if (!providers.includes(value)) providers.push(value);
  }

  return providers;
}

async function main() {
  const providers = parseProviders(valueAfter("--providers"));
  const runs = Number(valueAfter("--runs") ?? "1");
  const caseFilter = valueAfter("--case");
  const delayFlag = valueAfter("--delay-ms");
  const delayMs = delayFlag === undefined ? undefined : Number(delayFlag);

  if (providers.length < 1) throw new Error("Informe pelo menos um provider.");
  if (!Number.isInteger(runs) || runs < 1 || runs > 10) {
    throw new Error("--runs deve ser um inteiro entre 1 e 10.");
  }
  if (delayMs !== undefined && (!Number.isFinite(delayMs) || delayMs < 0)) {
    throw new Error("--delay-ms deve ser um número >= 0.");
  }

  console.log("=== CICLO 5B: CLOUD MULTI-PROVIDER BENCHMARK ===");
  console.log(`providers: ${providers.join(", ")}`);
  console.log(`runs: ${runs}`);
  console.log(`cases: ${caseFilter ?? "todos"}\n`);

  const readyProviders: BenchmarkProviderId[] = [];
  for (const provider of providers) {
    const readiness = await checkProviderReadiness(provider);
    if (readiness.ready) {
      readyProviders.push(provider);
      continue;
    }

    console.log(`--- ${provider} ---`);
    console.log(`SKIP: ${readiness.message}`);
    if (readiness.setupHint) console.log(`Configuração: ${readiness.setupHint}`);
    console.log();
  }

  if (readyProviders.length < 2) {
    console.log("A comparação exige dois providers cloud prontos: groq e openrouter.");
    console.log("Confira seu .env. OPENROUTER_API_KEY é obrigatória para usar a API do OpenRouter, inclusive com openrouter/free.");
    process.exitCode = 2;
    return;
  }

  const reports: BenchmarkReport[] = [];

  for (const provider of readyProviders) {
    const readiness = await checkProviderReadiness(provider);
    console.log(`--- ${provider} ---`);
    console.log(readiness.message);
    const startedAt = Date.now();

    const { report } = await runBenchmark({
      provider,
      runs,
      delayMs,
      caseIds: caseFilter ? caseFilter.split(",").map((value) => value.trim()) : undefined,
      onProgress: (event) => {
        if (event.phase === "case_start") {
          console.log(`[${event.current}/${event.total}] ${event.caseId}...`);
          return;
        }
        if (event.phase === "case_complete") {
          if (event.executionStatus === "provider_error") {
            console.log(`    ⚠ provider error: ${event.error ?? "erro externo"}`);
          } else if (event.executionStatus === "model_protocol_error") {
            console.log(`    ⚠ model protocol error: ${event.error ?? "tool call inválida"}`);
          } else if (event.executionStatus === "harness_error") {
            console.log(`    ⚠ harness error: ${event.error ?? "erro interno"}`);
          } else {
            console.log(
              `    ${event.passed ? "✓" : "✗"} ${event.latencyMs ?? 0} ms | ${event.tokens ?? "n/d"} tokens`,
            );
          }
          return;
        }
        if (event.phase === "rate_limit") {
          console.log(`    429: retry em ${Math.ceil((event.waitMs ?? 0) / 1000)} s...`);
          return;
        }
        if (event.phase === "delay" && (event.waitMs ?? 0) > 0) {
          console.log(`    espera ${Math.ceil((event.waitMs ?? 0) / 1000)} s...`);
        }
      },
    });

    reports.push(report);
    console.log(
      `${provider}: availability=${report.summary.providerAvailabilityPct}% pass=${report.summary.passRatePct}% tools=${report.summary.toolSelectionAccuracyPct}% args=${report.summary.argumentAccuracyPct}% grounding=${report.summary.groundingAccuracyPct}% semantic=${report.summary.semanticAnswerAccuracyPct}% numeric=${report.summary.numericAnswerAccuracyPct}% latency=${report.summary.averageLatencyMs}ms`,
    );
    console.log(`concluído em ${Math.round((Date.now() - startedAt) / 1000)} s\n`);
  }

  const { paths } = await writeBenchmarkComparison(reports);

  console.log("--- comparação ---");
  console.log(
    "Provider        Avail   Pass    Tools   Args    Grounding  Semantic  Numeric  Latência  Tokens",
  );
  for (const report of reports) {
    const s = report.summary;
    console.log(
      `${s.provider.padEnd(14)} ${String(s.providerAvailabilityPct).padStart(5)}%  ${String(s.passRatePct).padStart(5)}%  ${String(s.toolSelectionAccuracyPct).padStart(5)}%  ${String(s.argumentAccuracyPct).padStart(5)}%  ${String(s.groundingAccuracyPct).padStart(8)}%  ${String(s.semanticAnswerAccuracyPct).padStart(7)}%  ${String(s.numericAnswerAccuracyPct).padStart(6)}%  ${String(s.averageLatencyMs).padStart(7)}ms  ${String(s.averageTokens ?? "n/d").padStart(6)}`,
    );
  }

  console.log("\n--- relatório comparativo ---");
  console.log(paths.latestMd);
  console.log(paths.latestJson);
}

main().catch((error) => {
  console.error(`Erro no Ciclo 5B: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
