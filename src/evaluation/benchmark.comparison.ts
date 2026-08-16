import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BenchmarkComparisonReport, BenchmarkReport } from "./benchmark.types.js";

function markdown(report: BenchmarkComparisonReport): string {
  const lines = [
    "# Finance LLM Lab — Comparação Cloud Multi-Provider (Ciclo 5B)",
    "",
    `Gerado em: ${report.generatedAt}`,
    "",
    "Provider availability é separado das métricas de qualidade. Erros externos de API/rede não reduzem accuracy; falhas de protocolo geradas pelo modelo continuam contando como qualidade.",
    "",
    "| Provider | Modelo configurado | Availability | Pass | Tools | Args | Grounding | Semântico | Numérico | Latência média | P95 | Tokens médios |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];

  for (const item of report.reports) {
    const s = item.summary;
    lines.push(
      `| ${s.provider} | ${s.configuredModel} | ${s.providerAvailabilityPct}% | ${s.passRatePct}% | ${s.toolSelectionAccuracyPct}% | ${s.argumentAccuracyPct}% | ${s.groundingAccuracyPct}% | ${s.semanticAnswerAccuracyPct}% | ${s.numericAnswerAccuracyPct}% | ${s.averageLatencyMs} ms | ${s.p95LatencyMs} ms | ${s.averageTokens ?? "—"} |`,
    );
  }

  lines.push("", "## Execuções", "");
  for (const item of report.reports) {
    const s = item.summary;
    lines.push(
      `- **${s.provider}:** ${s.completedExecutions} completas; ${s.modelProtocolErrors} protocol errors; ${s.providerErrors} provider errors; ${s.harnessErrors} harness errors.`,
    );
  }

  lines.push("", "## Modelos observados", "");
  for (const item of report.reports) {
    lines.push(
      `- **${item.summary.provider}:** ${item.summary.observedModels.join(", ") || "nenhum"}`,
    );
  }

  lines.push("", "## Casos por provider", "");
  const caseIds = [
    ...new Set(report.reports.flatMap((item) => item.results.map((result) => result.caseId))),
  ];
  lines.push(`| Caso | ${report.reports.map((item) => item.summary.provider).join(" | ")} |`);
  lines.push(`|---|${report.reports.map(() => "---:").join("|")}|`);
  for (const caseId of caseIds) {
    const cells = report.reports.map((item) => {
      const matching = item.results.filter((result) => result.caseId === caseId);
      const complete = matching.filter((result) => result.executionStatus === "completed");
      const passed = complete.filter((result) => result.score.passed).length;
      const external = matching.filter(
        (result) => result.executionStatus === "provider_error" || result.executionStatus === "harness_error",
      ).length;
      const protocol = matching.filter(
        (result) => result.executionStatus === "model_protocol_error",
      ).length;
      const suffix = [external ? `${external} ext` : "", protocol ? `${protocol} proto` : ""]
        .filter(Boolean)
        .join(", ");
      return `${passed}/${complete.length}${suffix ? ` (${suffix})` : ""}`;
    });
    lines.push(`| ${caseId} | ${cells.join(" | ")} |`);
  }

  return lines.join("\n");
}

export async function writeBenchmarkComparison(reports: BenchmarkReport[]) {
  const report: BenchmarkComparisonReport = {
    generatedAt: new Date().toISOString(),
    providers: reports.map((item) => item.summary.provider),
    reports,
  };

  const directory = path.resolve("reports", "comparison");
  await mkdir(directory, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(directory, `comparison-${stamp}.json`);
  const mdPath = path.join(directory, `comparison-${stamp}.md`);
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

  return { report, paths: { jsonPath, mdPath, latestJson, latestMd } };
}
