import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  realConversationBenchmarkCases,
  type ConversationBenchmarkCase,
} from "../evaluation/conversation-benchmark.corpus.js";
import { createGroqRealFinancialAgentService } from "../services/real-financial-agent-groq.factory.js";

interface RealCaseResult {
  id: string;
  category: string;
  question: string;
  passed: boolean;
  failures: string[];
  mode: string;
  tools: string[];
  groundingPassed: boolean;
  argumentsPassed: boolean;
  contextualRouting: boolean;
  limitationDeclared: boolean | null;
  latencyMs: number;
  answer: string;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function indicatesLimitation(answer: string): boolean {
  const normalized = normalizeText(answer);
  return [
    "nao tenho",
    "nao ha",
    "nao consigo",
    "nao disponivel",
    "indisponivel",
    "dados insuficientes",
    "nao existem dados",
    "nao temos dados",
    "nao contem",
    "nao possui",
    "sem dados",
    "nao e possivel",
    "nao esta disponivel",
    "nao esta integrado",
  ].some((fragment) => normalized.includes(fragment));
}


function partialArgumentsMatch(
  actual: unknown,
  expected: Record<string, unknown> | undefined,
): boolean {
  if (!expected) return true;
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  const record = actual as Record<string, unknown>;
  return Object.entries(expected).every(
    ([key, value]) => JSON.stringify(record[key]) === JSON.stringify(value),
  );
}

function average(values: number[]): number {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function pct(value: number): number {
  return Math.round(value * 10_000) / 100;
}

function markdown(options: {
  generatedAt: string;
  results: RealCaseResult[];
  passRatePct: number;
  groundingPct: number;
  toolAccuracyPct: number;
  argumentAccuracyPct: number;
  contextAccuracyPct: number;
  limitationAccuracyPct: number;
  averageLatencyMs: number;
  thresholdsPassed: boolean;
}): string {
  const lines = [
    "# Pipinho — Benchmark Conversacional C11.4",
    "",
    `Gerado em: ${options.generatedAt}`,
    "",
    "## Gate do Ciclo 11",
    "",
    `- Status: **${options.thresholdsPassed ? "PASS" : "FAIL"}**`,
    `- Pass rate: ${options.passRatePct}% (mínimo: 90%)`,
    `- Grounding: ${options.groundingPct}% (mínimo: 100%)`,
    `- Tool accuracy: ${options.toolAccuracyPct}% (mínimo: 95%)`,
    `- Argument accuracy: ${options.argumentAccuracyPct}% (mínimo: 95%)`,
    `- Context accuracy: ${options.contextAccuracyPct}% (mínimo: 100%)`,
    `- Limitation accuracy: ${options.limitationAccuracyPct}% (mínimo: 100%)`,
    `- Latência média: ${Math.round(options.averageLatencyMs)} ms`,
    "",
    "## Casos",
    "",
    "| Caso | Categoria | Status | Mode | Tools | Grounding | Contexto | Latência |",
    "|---|---|---|---|---|---|---|---:|",
  ];

  for (const result of options.results) {
    lines.push(
      `| ${result.id} | ${result.category} | ${result.passed ? "✅" : "❌"} | ${result.mode} | ${result.tools.join(", ") || "—"} | ${result.groundingPassed ? "yes" : "no"} | ${result.contextualRouting ? "yes" : "no"} | ${result.latencyMs} ms |`,
    );
  }

  const failed = options.results.filter((result) => !result.passed);
  lines.push("", "## Falhas", "");
  if (!failed.length) {
    lines.push("Nenhuma falha observada.");
  } else {
    for (const result of failed) {
      lines.push(`### ${result.id}`, "");
      lines.push(`Pergunta: ${result.question}`, "");
      for (const failure of result.failures) lines.push(`- ${failure}`);
      lines.push("", `Resposta: ${result.answer.replace(/\s+/g, " ").slice(0, 500)}`, "");
    }
  }

  return lines.join("\n");
}

async function evaluateCase(
  agent: ReturnType<typeof createGroqRealFinancialAgentService>,
  testCase: ConversationBenchmarkCase,
): Promise<RealCaseResult> {
  const started = performance.now();
  try {
    const result = await agent.answer(testCase.question, {
      conversationId: `cycle11-benchmark-${testCase.id}`,
      history: testCase.history ?? [],
      memorySummary: testCase.memorySummary,
    });
    const tools = result.toolCalls
      .filter((tool) => tool.outcome === "executed")
      .map((tool) => tool.name);
    const groundingPassed = Object.values(result.grounding).every(
      (grounding) => grounding.passed,
    );
    const primaryExpectedTool = testCase.expectedTools[0];
    const primaryCall = primaryExpectedTool
      ? result.toolCalls.find(
          (tool) => tool.outcome === "executed" && tool.name === primaryExpectedTool,
        )
      : undefined;
    const argumentsPassed = partialArgumentsMatch(
      primaryCall?.arguments,
      testCase.expectedArguments,
    );
    const failures: string[] = [];

    for (const expected of testCase.expectedTools) {
      if (!tools.includes(expected)) failures.push(`tool obrigatória ausente: ${expected}`);
    }
    for (const forbidden of testCase.forbiddenTools ?? []) {
      if (tools.includes(forbidden)) failures.push(`tool proibida executada: ${forbidden}`);
    }
    if (testCase.expectedTools.length === 0 && tools.length > 0) {
      failures.push(`conversa simples executou tool: ${tools.join(", ")}`);
    }
    if (!groundingPassed) failures.push("grounding não passou em todas as camadas");
    if (!argumentsPassed) {
      failures.push(
        `argumentos esperados não observados: ${JSON.stringify(testCase.expectedArguments)}`,
      );
    }
    if (
      testCase.expectedContextualRouting !== undefined &&
      result.conversation.contextualRouting !== testCase.expectedContextualRouting
    ) {
      failures.push(
        `contextualRouting esperado ${testCase.expectedContextualRouting}, recebido ${result.conversation.contextualRouting}`,
      );
    }
    if (
      testCase.maxExecutedTools !== undefined &&
      tools.length > testCase.maxExecutedTools
    ) {
      failures.push(
        `tool budget do caso excedido: ${tools.length} > ${testCase.maxExecutedTools}`,
      );
    }

    const limitationDeclared = testCase.answerMustIndicateLimitation
      ? indicatesLimitation(result.answer)
      : null;
    if (testCase.answerMustIndicateLimitation && !limitationDeclared) {
      failures.push("resposta não declarou limitação de dados/capacidade");
    }

    return {
      id: testCase.id,
      category: testCase.category,
      question: testCase.question,
      passed: failures.length === 0,
      failures,
      mode: result.executionMode,
      tools,
      groundingPassed,
      argumentsPassed,
      contextualRouting: result.conversation.contextualRouting,
      limitationDeclared,
      latencyMs: Math.round(performance.now() - started),
      answer: result.answer,
    };
  } catch (error) {
    return {
      id: testCase.id,
      category: testCase.category,
      question: testCase.question,
      passed: false,
      failures: [error instanceof Error ? error.message : String(error)],
      mode: "error",
      tools: [],
      groundingPassed: false,
      argumentsPassed: false,
      contextualRouting: false,
      limitationDeclared: null,
      latencyMs: Math.round(performance.now() - started),
      answer: "",
    };
  }
}

async function run() {
  const agent = createGroqRealFinancialAgentService();
  const results: RealCaseResult[] = [];

  for (const testCase of realConversationBenchmarkCases) {
    results.push(await evaluateCase(agent, testCase));
  }

  const passRate = results.filter((result) => result.passed).length / results.length;
  const groundingRate = results.filter((result) => result.groundingPassed).length / results.length;
  const toolAccurate = results.filter((result, index) => {
    const testCase = realConversationBenchmarkCases[index]!;
    const required = testCase.expectedTools.every((tool) => result.tools.includes(tool));
    const forbidden = (testCase.forbiddenTools ?? []).every(
      (tool) => !result.tools.includes(tool),
    );
    const noneMeansNone = testCase.expectedTools.length > 0 || result.tools.length === 0;
    return required && forbidden && noneMeansNone;
  }).length / results.length;

  const argumentCases = results.filter((_, index) =>
    realConversationBenchmarkCases[index]!.expectedArguments !== undefined,
  );
  const argumentAccurate = argumentCases.length
    ? argumentCases.filter((result) => result.argumentsPassed).length / argumentCases.length
    : 1;

  const contextualCases = results.filter((_, index) =>
    realConversationBenchmarkCases[index]!.expectedContextualRouting !== undefined,
  );
  const contextAccurate = contextualCases.length
    ? contextualCases.filter((result, index) => {
        const originalIndex = results.indexOf(result);
        return (
          result.contextualRouting ===
          realConversationBenchmarkCases[originalIndex]!.expectedContextualRouting
        );
      }).length / contextualCases.length
    : 1;

  const limitationCases = results.filter((_, index) =>
    realConversationBenchmarkCases[index]!.answerMustIndicateLimitation,
  );
  const limitationAccurate = limitationCases.length
    ? limitationCases.filter((result) => result.limitationDeclared === true).length /
      limitationCases.length
    : 1;

  const summary = {
    cases: results.length,
    passed: results.filter((result) => result.passed).length,
    passRatePct: pct(passRate),
    groundingPct: pct(groundingRate),
    toolAccuracyPct: pct(toolAccurate),
    argumentAccuracyPct: pct(argumentAccurate),
    contextAccuracyPct: pct(contextAccurate),
    limitationAccuracyPct: pct(limitationAccurate),
    averageLatencyMs: Math.round(average(results.map((result) => result.latencyMs))),
  };

  const thresholdsPassed =
    summary.passRatePct >= 90 &&
    summary.groundingPct === 100 &&
    summary.toolAccuracyPct >= 95 &&
    summary.argumentAccuracyPct >= 95 &&
    summary.contextAccuracyPct === 100 &&
    summary.limitationAccuracyPct === 100;

  console.table(
    results.map((result) => ({
      id: result.id,
      status: result.passed ? "PASS" : "FAIL",
      mode: result.mode,
      tools: result.tools.join(", ") || "—",
      grounded: result.groundingPassed ? "yes" : "no",
      context: result.contextualRouting ? "yes" : "no",
      latency: `${result.latencyMs}ms`,
      answer: result.answer.replace(/\s+/g, " ").slice(0, 80),
    })),
  );
  console.table([summary]);

  const generatedAt = new Date().toISOString();
  const report = { generatedAt, thresholdsPassed, summary, results };
  const directory = path.resolve("reports", "conversation");
  await mkdir(directory, { recursive: true });
  const stamp = generatedAt.replace(/[:.]/g, "-");
  const md = markdown({ generatedAt, results, ...summary, thresholdsPassed });
  await Promise.all([
    writeFile(path.join(directory, `benchmark-${stamp}.json`), JSON.stringify(report, null, 2), "utf8"),
    writeFile(path.join(directory, `benchmark-${stamp}.md`), md, "utf8"),
    writeFile(path.join(directory, "latest.json"), JSON.stringify(report, null, 2), "utf8"),
    writeFile(path.join(directory, "latest.md"), md, "utf8"),
  ]);

  console.log(`\nCycle 11.4 gate: ${thresholdsPassed ? "PASS" : "FAIL"}`);
  console.log("Report: reports/conversation/latest.md");
  if (!thresholdsPassed) process.exitCode = 1;
}

run().catch((error) => {
  console.error(
    "Cycle 11.4 conversational benchmark failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
