import { routeFinancialTools } from "../agent/financial-tool-router.js";
import { createRealFinancialAgentService } from "../services/real-financial-agent.factory.js";
import { isTransientLlmError } from "../llm/providers/llm-retry.js";

const cases = [
  {
    id: "general-flow",
    question: "Analise meu fluxo financeiro",
    expectedAnyTool: ["get_cash_flow"],
    forbiddenAnswerPattern: /detalhes\s+por\s+categoria[\s\S]*R\$/i,
  },
  {
    id: "savings-quality",
    question: "Qual é minha taxa de poupança?",
    expectedAnyTool: ["get_savings_status"],
    forbiddenAnswerPattern: /taxa de poupan[cç]a\s+(?:foi|é|de)\s*R?\$?\s*-?\d/i,
  },
  {
    id: "categories",
    question: "Quais são minhas maiores categorias de gastos?",
    expectedAnyTool: ["get_spending_by_category"],
  },
  {
    id: "institutions",
    question: "Em qual instituição eu mais gastei?",
    expectedAnyTool: ["get_spending_by_institution"],
  },
  {
    id: "largest-expenses",
    question: "Quais foram meus maiores gastos?",
    expectedAnyTool: ["get_largest_expenses"],
  },
  {
    id: "july",
    question: "Quanto eu gastei em julho?",
    expectedAnyTool: ["get_spending_summary"],
  },
  {
    id: "outside-period",
    question: "Quanto eu gastei em 2023?",
    expectedAnyTool: ["get_spending_summary"],
  },
  {
    id: "monthly-trend",
    question: "Como meus gastos evoluíram mês a mês?",
    expectedAnyTool: ["get_monthly_financial_trend"],
  },
  {
    id: "month-comparison",
    question: "Gastei mais em julho ou junho?",
    expectedAnyTool: ["get_monthly_financial_trend"],
  },
  {
    id: "food-category",
    question: "Quanto gastei com alimentação em julho?",
    expectedAnyTool: ["get_spending_by_category"],
  },
  {
    id: "unsupported-balance",
    question: "Qual é meu saldo bancário atual?",
    expectedAnyTool: ["get_data_capabilities"],
  },
] as const;

console.log("=== QA AGENT: MATRIZ EXPLORATÓRIA ===");
console.log("Este teste usa Groq + dados reais e não é um gate determinístico de CI.\n");

const service = createRealFinancialAgentService({
  provider: "groq",
  referenceDate: "2026-08-19",
});
let passed = 0;
let failed = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function groundingDiagnostics(result: Awaited<ReturnType<typeof service.answer>>): string[] {
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
      .slice(0, 4)
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

for (const testCase of cases) {
  const route = routeFinancialTools(testCase.question);
  process.stdout.write(
    `[${testCase.id}] ${testCase.question} [route=${route.intent}:${route.toolNames.join(",")}] ... `,
  );

  let result: Awaited<ReturnType<typeof service.answer>> | null = null;
  let caseRetryCount = 0;
  let terminalError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      result = await service.answer(testCase.question);
      terminalError = null;
      break;
    } catch (error) {
      terminalError = error;
      if (attempt === 0 && isTransientLlmError(error)) {
        caseRetryCount += 1;
        await sleep(1200);
        continue;
      }
      break;
    }
  }

  if (!result) {
    failed += 1;
    console.log(
      `ERROR | ${terminalError instanceof Error ? terminalError.message : String(terminalError)} | caseRetries=${caseRetryCount}`,
    );
    continue;
  }

  const toolNames = result.toolCalls
    .filter((tool) => tool.outcome === "executed")
    .map((tool) => tool.name);
  const rejected = result.toolCalls.filter((tool) => tool.outcome === "rejected");
  const repairEntries = [
    ["causal", result.llm.groundingRepair],
    ["quality", result.llm.qualityRepair],
    ["provenance", result.llm.provenanceRepair],
    ["evidence", result.llm.evidenceRepair],
  ] as const;
  const appliedRepairs = repairEntries.filter(([, repair]) => repair?.applied);
  const llmRepairCount = appliedRepairs.filter(
    ([, repair]) => repair && !repair.model.startsWith("deterministic-"),
  ).length;
  const deterministicRepairCount = appliedRepairs.length - llmRepairCount;
  const repairSummary =
    appliedRepairs
      .map(([name, repair]) =>
        `${name}:${repair?.model.startsWith("deterministic-") ? "det" : "llm"}`,
      )
      .join(",") || "none";
  const hasExpectedTool = testCase.expectedAnyTool.some((name) =>
    toolNames.includes(name),
  );
  const forbidden =
    "forbiddenAnswerPattern" in testCase && testCase.forbiddenAnswerPattern
      ? testCase.forbiddenAnswerPattern.test(result.answer ?? "")
      : false;
  const groundingPassed =
    result.grounding.causal.passed &&
    result.grounding.quality.passed &&
    (result.grounding.provenance?.passed ?? true) &&
    (result.grounding.evidence?.passed ?? true);

  if (hasExpectedTool && !forbidden && groundingPassed) {
    passed += 1;
    console.log(
      `PASS${caseRetryCount ? "_WITH_RETRY" : ""} | mode=${result.executionMode} | tools=${toolNames.join(",") || "none"} | rejected=${rejected.length} | repairs=${repairSummary} | caseRetries=${caseRetryCount} | iterations=${result.turns.length} | latency=${result.llm.total.latencyMs}ms`,
    );
    if (
      rejected.length > 0 ||
      llmRepairCount > 0 ||
      caseRetryCount > 0 ||
      result.llm.total.latencyMs > 10000
    ) {
      console.log(
        "  ! performance/robustness warning: houve rejeição, repair por LLM, retry de caso ou latência acima de dez segundos.",
      );
    }
    if (deterministicRepairCount > 0) {
      console.log(
        `  · safety sanitizer determinístico aplicado ${deterministicRepairCount} vez(es); não houve custo adicional de LLM por esse repair.`,
      );
    }
  } else {
    failed += 1;
    console.log(
      `FAIL | tools=${toolNames.join(",") || "none"} | grounding=${groundingPassed} | forbidden=${forbidden} | caseRetries=${caseRetryCount}`,
    );
    for (const diagnostic of groundingDiagnostics(result)) {
      console.log(`  ! ${diagnostic}`);
    }
    if (!hasExpectedTool) {
      console.log(`  ! expected tool: ${testCase.expectedAnyTool.join(" ou ")}`);
    }
  }

  // Evita rajada de requests no QA exploratório. O snapshot Pluggy continua
  // em cache; esta pausa afeta apenas o provider LLM.
  await sleep(300);
}

console.log(`\nResultado: ${passed}/${cases.length} PASS; ${failed} FAIL/ERROR.`);
if (failed > 0) process.exitCode = 1;
