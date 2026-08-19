import { routeFinancialTools } from "../agent/financial-tool-router.js";
import { isTransientLlmError } from "../llm/providers/llm-retry.js";
import { createRealFinancialAgentService } from "../services/real-financial-agent.factory.js";

const rawArgs = process.argv.slice(2);
const runsIndex = rawArgs.indexOf("--runs");
const requestedRuns = runsIndex >= 0 ? Number(rawArgs[runsIndex + 1]) : 3;
const runs = Number.isInteger(requestedRuns) && requestedRuns > 0 && requestedRuns <= 20
  ? requestedRuns
  : 3;

const cases = [
  { id: "general-flow", question: "Analise meu fluxo financeiro", expected: "get_cash_flow" },
  { id: "savings", question: "Qual é minha taxa de poupança?", expected: "get_savings_status" },
  { id: "july", question: "Quanto eu gastei em julho?", expected: "get_spending_summary" },
  { id: "month-comparison", question: "Gastei mais em julho ou junho?", expected: "get_monthly_financial_trend" },
  { id: "food", question: "Quanto gastei com alimentação em julho?", expected: "get_spending_by_category" },
] as const;

const service = createRealFinancialAgentService({
  provider: "groq",
  referenceDate: "2026-08-19",
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


function groundingDiagnostics(
  result: Awaited<ReturnType<typeof service.answer>>,
): string[] {
  const lines: string[] = [];
  const entries = [
    ["causal", result.grounding.causal],
    ["quality", result.grounding.quality],
    ["provenance", result.grounding.provenance],
    ["evidence", result.grounding.evidence],
  ] as const;

  for (const [name, grounding] of entries) {
    if (!grounding || grounding.passed) continue;
    const fragments = grounding.violations
      .slice(0, 3)
      .map((violation) => {
        const location =
          "fragment" in violation && typeof violation.fragment === "string"
            ? violation.fragment
            : "sentence" in violation && typeof violation.sentence === "string"
              ? violation.sentence
              : violation.detail;
        return `${violation.code}: ${location}`;
      })
      .join(" | ");
    lines.push(`${name}=${fragments || "failed"}`);
  }

  return lines;
}

function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

console.log("=== QA AGENT SOAK ===");
console.log(`Casos: ${cases.length}`);
console.log(`Execuções por caso: ${runs}`);
console.log(`Total planejado: ${cases.length * runs}`);
console.log("Objetivo: separar correção semântica, disponibilidade do provider e performance.\n");

let total = 0;
let semanticPass = 0;
let providerErrors = 0;
let caseRetries = 0;
let deterministicRepairs = 0;
let llmRepairs = 0;
let fastPathCount = 0;
let redundantToolCalls = 0;
const latencies: number[] = [];

for (const testCase of cases) {
  const route = routeFinancialTools(testCase.question);
  console.log(`[${testCase.id}] route=${route.intent}:${route.toolNames.join(",")}`);

  for (let run = 1; run <= runs; run += 1) {
    total += 1;
    let result: Awaited<ReturnType<typeof service.answer>> | null = null;
    let usedCaseRetry = false;
    let terminalError: unknown = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        result = await service.answer(testCase.question);
        terminalError = null;
        break;
      } catch (error) {
        terminalError = error;
        if (attempt === 0 && isTransientLlmError(error)) {
          usedCaseRetry = true;
          caseRetries += 1;
          await sleep(1200);
          continue;
        }
        break;
      }
    }

    if (!result) {
      providerErrors += 1;
      console.log(
        `  run ${run}: PROVIDER_ERROR | ${terminalError instanceof Error ? terminalError.message : String(terminalError)}`,
      );
      await sleep(350);
      continue;
    }

    latencies.push(result.llm.total.latencyMs);
    if (result.executionMode === "fast_path") fastPathCount += 1;

    const executed = result.toolCalls
      .filter((tool) => tool.outcome === "executed")
      .map((tool) => tool.name);
    const expectedCount = executed.filter((name) => name === testCase.expected).length;
    if (expectedCount > 1) redundantToolCalls += expectedCount - 1;

    const repairs = [
      result.llm.groundingRepair,
      result.llm.qualityRepair,
      result.llm.provenanceRepair,
      result.llm.evidenceRepair,
    ].filter((repair) => repair?.applied);
    deterministicRepairs += repairs.filter((repair) =>
      repair?.model.startsWith("deterministic-"),
    ).length;
    llmRepairs += repairs.filter((repair) =>
      repair && !repair.model.startsWith("deterministic-"),
    ).length;

    const groundingPassed =
      result.grounding.causal.passed &&
      result.grounding.quality.passed &&
      result.grounding.provenance.passed &&
      result.grounding.evidence.passed;
    const toolPassed = executed.includes(testCase.expected);
    const passed = groundingPassed && toolPassed;
    if (passed) semanticPass += 1;

    console.log(
      `  run ${run}: ${passed ? "PASS" : "FAIL"} | mode=${result.executionMode} | tools=${executed.join(",") || "none"} | iterations=${result.iterations} | latency=${result.llm.total.latencyMs}ms${usedCaseRetry ? " | caseRetry=1" : ""}`,
    );
    if (!passed) {
      for (const diagnostic of groundingDiagnostics(result)) {
        console.log(`    ! ${diagnostic}`);
      }
      if (!toolPassed) {
        console.log(`    ! expected_tool=${testCase.expected}`);
      }
      console.log(`    ! answer=${JSON.stringify((result.answer ?? "").slice(0, 500))}`);
    }

    await sleep(350);
  }
}

const availabilityDenominator = total;
const completed = total - providerErrors;
const semanticPassPct = completed > 0 ? (semanticPass / completed) * 100 : 0;
const availabilityPct = availabilityDenominator > 0
  ? (completed / availabilityDenominator) * 100
  : 0;

console.log("\n--- RESUMO SOAK ---");
console.log(`Total:                    ${total}`);
console.log(`Concluídas:                ${completed}`);
console.log(`Semantic pass:             ${semanticPass}/${completed} (${semanticPassPct.toFixed(2)}%)`);
console.log(`Provider availability:     ${completed}/${total} (${availabilityPct.toFixed(2)}%)`);
console.log(`Fast path:                 ${fastPathCount}/${completed}`);
console.log(`Tool calls redundantes:    ${redundantToolCalls}`);
console.log(`Repairs determinísticos:   ${deterministicRepairs}`);
console.log(`Repairs via LLM:           ${llmRepairs}`);
console.log(`Retries de caso:           ${caseRetries}`);
console.log(`Latência P50:              ${percentile(latencies, 50)} ms`);
console.log(`Latência P95:              ${percentile(latencies, 95)} ms`);

if (semanticPass !== completed || providerErrors > 0 || redundantToolCalls > 0) {
  console.log("\nSOAK com ocorrências: revise FAILs/provider errors/tool calls redundantes antes do release.");
  process.exitCode = 1;
} else {
  console.log("\nSOAK aprovado: nenhuma falha semântica, indisponibilidade terminal ou tool call redundante observada.");
}
