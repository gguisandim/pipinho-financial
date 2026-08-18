import { createRealFinancialAgentService } from "../services/real-financial-agent.factory.js";

const cases = [
  {
    id: "general-flow",
    question: "Analise meu fluxo financeiro",
    expectedAnyTool: ["get_cash_flow"],
  },
  {
    id: "savings-quality",
    question: "Qual é minha taxa de poupança?",
    expectedAnyTool: ["get_cash_flow", "get_income"],
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
    expectedAnyTool: ["get_cash_flow", "get_spending_by_category"],
  },
  {
    id: "outside-period",
    question: "Quanto eu gastei em 2023?",
    expectedAnyTool: ["get_cash_flow", "get_financial_period"],
  },
] as const;

console.log("=== QA AGENT: MATRIZ EXPLORATÓRIA ===");
console.log("Este teste usa Groq + dados reais e não é um gate determinístico de CI.\n");

const service = createRealFinancialAgentService({ provider: "groq", referenceDate: "2026-08-18" });
let passed = 0;
let failed = 0;

for (const testCase of cases) {
  process.stdout.write(`[${testCase.id}] ${testCase.question} ... `);
  try {
    const result = await service.answer(testCase.question);
    const toolNames = result.toolCalls
      .filter((tool) => tool.outcome === "executed")
      .map((tool) => tool.name);
    const rejected = result.toolCalls.filter((tool) => tool.outcome === "rejected");
    const repairCount = [
      result.llm.groundingRepair,
      result.llm.qualityRepair,
      result.llm.provenanceRepair,
    ].filter(Boolean).length;
    const hasExpectedTool = testCase.expectedAnyTool.some((name) => toolNames.includes(name));
    const forbidden =
      "forbiddenAnswerPattern" in testCase && testCase.forbiddenAnswerPattern
        ? testCase.forbiddenAnswerPattern.test(result.answer ?? "")
        : false;
    const groundingPassed =
      result.grounding.causal.passed &&
      result.grounding.quality.passed &&
      (result.grounding.provenance?.passed ?? true);

    if (hasExpectedTool && !forbidden && groundingPassed) {
      passed += 1;
      console.log(`PASS | tools=${toolNames.join(",") || "none"} | rejected=${rejected.length} | repairs=${repairCount} | iterations=${result.turns.length} | latency=${result.llm.total.latencyMs}ms`);
      if (rejected.length > 0 || repairCount > 0 || result.llm.total.latencyMs > 10000) {
        console.log("  ! performance/robustness warning: houve rejeição, repair ou latência acima de dez segundos.");
      }
    } else {
      failed += 1;
      console.log(`FAIL | tools=${toolNames.join(",") || "none"} | grounding=${groundingPassed} | forbidden=${forbidden}`);
    }
  } catch (error) {
    failed += 1;
    console.log(`ERROR | ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`\nResultado: ${passed}/${cases.length} PASS; ${failed} FAIL/ERROR.`);
if (failed > 0) process.exitCode = 1;
