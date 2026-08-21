import {
  buildContextualRoutingQuestion,
} from "../agent/conversation-context.js";
import {
  routeFinancialTools,
} from "../agent/financial-tool-router.js";
import { normalizeFinancialToolArguments } from "../agent/financial-tool-argument-normalizer.js";
import type { ConversationBenchmarkCase } from "./conversation-benchmark.corpus.js";

export interface ConversationBenchmarkLocalResult {
  id: string;
  passed: boolean;
  failures: string[];
  routedIntent: string;
  routedTools: string[];
  contextualRouting: boolean;
  normalizedArguments: Record<string, unknown> | null;
}

function partialObjectMatch(
  actual: Record<string, unknown> | null,
  expected: Record<string, unknown> | undefined,
): boolean {
  if (!expected) return true;
  if (!actual) return false;
  return Object.entries(expected).every(
    ([key, value]) => JSON.stringify(actual[key]) === JSON.stringify(value),
  );
}

function parseObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function evaluateConversationBenchmarkCase(options: {
  testCase: ConversationBenchmarkCase;
  referenceDate: string;
}): ConversationBenchmarkLocalResult {
  const { testCase, referenceDate } = options;
  const contextualQuestion = buildContextualRoutingQuestion(
    testCase.question,
    testCase.history,
    testCase.memorySummary,
  );
  const routing = routeFinancialTools(contextualQuestion);
  const contextualRouting = contextualQuestion !== testCase.question;
  const failures: string[] = [];

  if (routing.intent !== testCase.expectedIntent) {
    failures.push(`intent: esperado ${testCase.expectedIntent}, recebido ${routing.intent}`);
  }

  for (const expectedTool of testCase.expectedTools) {
    if (!routing.toolNames.includes(expectedTool)) {
      failures.push(`tool: ${expectedTool} não foi roteada`);
    }
  }

  for (const forbiddenTool of testCase.forbiddenTools ?? []) {
    if (routing.toolNames.includes(forbiddenTool)) {
      failures.push(`tool: ${forbiddenTool} foi roteada mas é proibida`);
    }
  }

  if (
    testCase.expectedContextualRouting !== undefined &&
    contextualRouting !== testCase.expectedContextualRouting
  ) {
    failures.push(
      `contexto: esperado ${testCase.expectedContextualRouting}, recebido ${contextualRouting}`,
    );
  }

  const primaryTool = testCase.expectedTools[0];
  const normalizedArguments = primaryTool
    ? parseObject(
        normalizeFinancialToolArguments({
          question: contextualQuestion,
          name: primaryTool,
          rawArguments: "{}",
          referenceDate,
          availablePeriod: null,
        }),
      )
    : {};

  if (!partialObjectMatch(normalizedArguments, testCase.expectedArguments)) {
    failures.push(
      `arguments: esperado ${JSON.stringify(testCase.expectedArguments)}, recebido ${JSON.stringify(normalizedArguments)}`,
    );
  }

  return {
    id: testCase.id,
    passed: failures.length === 0,
    failures,
    routedIntent: routing.intent,
    routedTools: routing.toolNames,
    contextualRouting,
    normalizedArguments,
  };
}

export function summarizeConversationBenchmark(
  results: ConversationBenchmarkLocalResult[],
) {
  const passed = results.filter((item) => item.passed).length;
  return {
    cases: results.length,
    passed,
    failed: results.length - passed,
    passRatePct: results.length ? Math.round((passed / results.length) * 10_000) / 100 : 0,
  };
}
