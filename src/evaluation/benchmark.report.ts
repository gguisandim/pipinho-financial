import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  BenchmarkCaseResult,
  BenchmarkProviderId,
  BenchmarkReport,
  BenchmarkSummary,
} from "./benchmark.types.js";

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.min(
    ordered.length - 1,
    Math.max(0, Math.ceil(percentileValue * ordered.length) - 1),
  );
  return ordered[index];
}

export function summarizeBenchmark(options: {
  provider: BenchmarkProviderId;
  configuredModel: string;
  referenceDate: string;
  runs: number;
  caseCount: number;
  results: BenchmarkCaseResult[];
}): BenchmarkSummary {
  const { results } = options;
  const completed = results.filter((result) => result.executionStatus === "completed");
  const protocolErrors = results.filter(
    (result) => result.executionStatus === "model_protocol_error",
  );
  const providerErrors = results.filter((result) => result.executionStatus === "provider_error");
  const harnessErrors = results.filter((result) => result.executionStatus === "harness_error");
  const qualityResults = [...completed, ...protocolErrors];

  const tokenValues = completed.flatMap((result) =>
    result.tokens === null ? [] : [result.tokens],
  );
  const latencyValues = completed.flatMap((result) =>
    result.latencyMs > 0 ? [result.latencyMs] : [],
  );
  const observedModels = [
    ...new Set(results.flatMap((result) => result.models).filter(Boolean)),
  ];
  const passed = qualityResults.filter((result) => result.score.passed).length;
  const qualityCount = qualityResults.length;

  return {
    provider: options.provider,
    configuredModel: options.configuredModel,
    observedModels,
    referenceDate: options.referenceDate,
    runs: options.runs,
    caseCount: options.caseCount,
    executionCount: results.length,
    completedExecutions: completed.length,
    modelProtocolErrors: protocolErrors.length,
    providerErrors: providerErrors.length,
    harnessErrors: harnessErrors.length,
    qualityExecutionCount: qualityCount,
    providerAvailabilityPct: round(
      results.length ? ((results.length - providerErrors.length) / results.length) * 100 : 0,
    ),
    passed,
    passRatePct: round(qualityCount ? (passed / qualityCount) * 100 : 0),
    toolSelectionAccuracyPct: round(
      average(qualityResults.map((result) => result.score.toolSelection)) * 100,
    ),
    argumentAccuracyPct: round(
      average(qualityResults.map((result) => result.score.argumentAccuracy)) * 100,
    ),
    groundingAccuracyPct: round(
      average(qualityResults.map((result) => result.score.grounding)) * 100,
    ),
    causalRepairRatePct: round(
      completed.length
        ? (completed.filter((result) => result.causalGrounding.repaired).length /
            completed.length) *
            100
        : 0,
    ),
    semanticAnswerAccuracyPct: round(
      average(qualityResults.map((result) => result.score.semanticAnswer)) * 100,
    ),
    numericAnswerAccuracyPct: round(
      average(qualityResults.map((result) => result.score.numericAnswer)) * 100,
    ),
    answerRequirementAccuracyPct: round(
      average(qualityResults.map((result) => result.score.answerRequirements)) * 100,
    ),
    averageIterations: round(average(completed.map((result) => result.iterations))),
    averageToolCalls: round(average(completed.map((result) => result.toolCalls.length))),
    averageLatencyMs: round(average(latencyValues)),
    p50LatencyMs: percentile(latencyValues, 0.5),
    p95LatencyMs: percentile(latencyValues, 0.95),
    tokenCoveragePct: round(
      completed.length ? (tokenValues.length / completed.length) * 100 : 0,
    ),
    averageTokens: tokenValues.length ? round(average(tokenValues)) : null,
    totalTokens: tokenValues.length
      ? tokenValues.reduce((sum, value) => sum + value, 0)
      : null,
  };
}

function statusLabel(result: BenchmarkCaseResult): string {
  if (result.executionStatus === "provider_error") return "⚠ provider";
  if (result.executionStatus === "model_protocol_error") return "⚠ protocol";
  if (result.executionStatus === "harness_error") return "⚠ harness";
  return result.score.passed ? "✅" : "❌";
}

function markdown(report: BenchmarkReport): string {
  const { summary } = report;
  const lines = [
    "# Finance LLM Lab — Benchmark Ciclo 5",
    "",
    `Gerado em: ${report.generatedAt}`,
    `Provider: \`${summary.provider}\``,
    `Modelo configurado: \`${summary.configuredModel}\``,
    `Modelos observados: ${summary.observedModels.map((model) => `\`${model}\``).join(", ") || "—"}`,
    `Data de referência: \`${summary.referenceDate}\``,
    "",
    "## Resumo",
    "",
    "As métricas de qualidade usam apenas execuções avaliáveis: respostas completas e falhas de protocolo do modelo. Falhas externas de provider e falhas internas do harness são reportadas separadamente.",
    "",
    "| Métrica | Resultado |",
    "|---|---:|",
    `| Execuções solicitadas | ${summary.executionCount} |`,
    `| Execuções completas | ${summary.completedExecutions} |`,
    `| Falhas de protocolo do modelo | ${summary.modelProtocolErrors} |`,
    `| Falhas do provider | ${summary.providerErrors} |`,
    `| Falhas do harness | ${summary.harnessErrors} |`,
    `| Disponibilidade do provider | ${summary.providerAvailabilityPct}% |`,
    `| Execuções avaliáveis | ${summary.qualityExecutionCount} |`,
    `| Pass rate | ${summary.passRatePct}% |`,
    `| Tool selection accuracy | ${summary.toolSelectionAccuracyPct}% |`,
    `| Argument accuracy | ${summary.argumentAccuracyPct}% |`,
    `| Grounding accuracy | ${summary.groundingAccuracyPct}% |`,
    `| Causal repair rate | ${summary.causalRepairRatePct}% |`,
    `| Semantic answer accuracy | ${summary.semanticAnswerAccuracyPct}% |`,
    `| Numeric answer accuracy | ${summary.numericAnswerAccuracyPct}% |`,
    `| Answer requirements | ${summary.answerRequirementAccuracyPct}% |`,
    `| Iterações médias | ${summary.averageIterations} |`,
    `| Tools médias | ${summary.averageToolCalls} |`,
    `| Latência média | ${summary.averageLatencyMs} ms |`,
    `| P50 | ${summary.p50LatencyMs} ms |`,
    `| P95 | ${summary.p95LatencyMs} ms |`,
    `| Cobertura de tokens | ${summary.tokenCoveragePct}% |`,
    `| Tokens médios | ${summary.averageTokens ?? "—"} |`,
    `| Tokens totais | ${summary.totalTokens ?? "—"} |`,
    "",
    "## Casos",
    "",
    "| Caso | Status | Tools | Args | Grounding | Semântico | Numérico | Latência | Tokens |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|",
  ];

  for (const result of report.results) {
    lines.push(
      `| ${result.caseId}#${result.run} | ${statusLabel(result)} | ${Math.round(result.score.toolSelection * 100)}% | ${Math.round(result.score.argumentAccuracy * 100)}% | ${Math.round(result.score.grounding * 100)}% | ${Math.round(result.score.semanticAnswer * 100)}% | ${Math.round(result.score.numericAnswer * 100)}% | ${result.latencyMs || "—"} | ${result.tokens ?? "—"} |`,
    );
  }

  lines.push("", "## Falhas e avisos", "");
  const problematic = report.results.filter(
    (result) => result.executionStatus !== "completed" || !result.score.passed,
  );
  if (problematic.length === 0) {
    lines.push("Nenhuma falha nos critérios determinísticos desta execução.");
  } else {
    for (const result of problematic) {
      lines.push(`### ${result.caseId}#${result.run}`, "");
      lines.push(`Status: \`${result.executionStatus}\``, "");
      lines.push(`Modelo observado: \`${result.model}\``, "");
      if (result.error) lines.push(`Erro: ${result.error}`, "");
      for (const failure of result.score.failures) lines.push(`- ${failure}`);
      if (result.answer) lines.push("", "Resposta:", "", result.answer, "");
    }
  }

  return lines.join("\n");
}

export async function writeBenchmarkReport(report: BenchmarkReport) {
  const directory = path.resolve("reports", report.summary.provider);
  await mkdir(directory, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(directory, `benchmark-${stamp}.json`);
  const mdPath = path.join(directory, `benchmark-${stamp}.md`);
  const latestJson = path.join(directory, "latest.json");
  const latestMd = path.join(directory, "latest.md");

  const json = JSON.stringify(report, null, 2);
  const md = markdown(report);
  await Promise.all([
    writeFile(jsonPath, json, "utf8"),
    writeFile(mdPath, md, "utf8"),
    writeFile(latestJson, json, "utf8"),
    writeFile(latestMd, md, "utf8"),
  ]);

  return { jsonPath, mdPath, latestJson, latestMd };
}
