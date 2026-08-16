import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  BenchmarkCaseResult,
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
  model: string;
  referenceDate: string;
  runs: number;
  caseCount: number;
  results: BenchmarkCaseResult[];
}): BenchmarkSummary {
  const { results } = options;
  const tokenValues = results.map((result) => result.tokens ?? 0);

  return {
    model: options.model,
    referenceDate: options.referenceDate,
    runs: options.runs,
    caseCount: options.caseCount,
    executionCount: results.length,
    passed: results.filter((result) => result.score.passed).length,
    passRatePct: round(
      (results.filter((result) => result.score.passed).length / results.length) * 100,
    ),
    toolSelectionAccuracyPct: round(
      average(results.map((result) => result.score.toolSelection)) * 100,
    ),
    argumentAccuracyPct: round(
      average(results.map((result) => result.score.argumentAccuracy)) * 100,
    ),
    groundingAccuracyPct: round(
      average(results.map((result) => result.score.grounding)) * 100,
    ),
    causalRepairRatePct: round(
      (results.filter((result) => result.causalGrounding.repaired).length / results.length) * 100,
    ),
    answerRequirementAccuracyPct: round(
      average(results.map((result) => result.score.answerRequirements)) * 100,
    ),
    averageIterations: round(average(results.map((result) => result.iterations))),
    averageToolCalls: round(average(results.map((result) => result.toolCalls.length))),
    averageLatencyMs: round(average(results.map((result) => result.latencyMs))),
    p50LatencyMs: percentile(results.map((result) => result.latencyMs), 0.5),
    p95LatencyMs: percentile(results.map((result) => result.latencyMs), 0.95),
    averageTokens: round(average(tokenValues)),
    totalTokens: tokenValues.reduce((sum, value) => sum + value, 0),
  };
}

function markdown(report: BenchmarkReport): string {
  const { summary } = report;
  const lines = [
    "# Finance LLM Lab — Benchmark Ciclo 5A",
    "",
    `Gerado em: ${report.generatedAt}`,
    `Modelo: \`${summary.model}\``,
    `Data de referência: \`${summary.referenceDate}\``,
    "",
    "## Resumo",
    "",
    "| Métrica | Resultado |",
    "|---|---:|",
    `| Pass rate | ${summary.passRatePct}% |`,
    `| Tool selection accuracy | ${summary.toolSelectionAccuracyPct}% |`,
    `| Argument accuracy | ${summary.argumentAccuracyPct}% |`,
    `| Grounding accuracy | ${summary.groundingAccuracyPct}% |`,
    `| Causal repair rate | ${summary.causalRepairRatePct}% |`,
    `| Answer requirements | ${summary.answerRequirementAccuracyPct}% |`,
    `| Iterações médias | ${summary.averageIterations} |`,
    `| Tools médias | ${summary.averageToolCalls} |`,
    `| Latência média | ${summary.averageLatencyMs} ms |`,
    `| P50 | ${summary.p50LatencyMs} ms |`,
    `| P95 | ${summary.p95LatencyMs} ms |`,
    `| Tokens médios | ${summary.averageTokens} |`,
    `| Tokens totais | ${summary.totalTokens} |`,
    "",
    "## Casos",
    "",
    "| Caso | Passou | Tools | Args | Grounding | Resposta | Latência | Tokens |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  ];

  for (const result of report.results) {
    lines.push(
      `| ${result.caseId}#${result.run} | ${result.score.passed ? "✅" : "❌"} | ${Math.round(result.score.toolSelection * 100)}% | ${Math.round(result.score.argumentAccuracy * 100)}% | ${Math.round(result.score.grounding * 100)}% | ${Math.round(result.score.answerRequirements * 100)}% | ${result.latencyMs} ms | ${result.tokens ?? 0} |`,
    );
  }

  lines.push("", "## Falhas", "");
  const failed = report.results.filter((result) => !result.score.passed);
  if (failed.length === 0) {
    lines.push("Nenhuma falha nos critérios determinísticos desta execução.");
  } else {
    for (const result of failed) {
      lines.push(`### ${result.caseId}#${result.run}`, "");
      for (const failure of result.score.failures) lines.push(`- ${failure}`);
      lines.push("", "Resposta:", "", result.answer, "");
    }
  }

  return lines.join("\n");
}

export async function writeBenchmarkReport(report: BenchmarkReport) {
  const directory = path.resolve("reports");
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
