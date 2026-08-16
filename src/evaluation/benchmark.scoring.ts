import { evaluateCausalGrounding } from "../agent/causal-grounding.js";
import type { AgentToolTrace } from "../agent/financial-agent.types.js";
import {
  containsBenchmarkConcept,
  containsExpectedNumber,
  normalizeBenchmarkText,
} from "./benchmark.text.js";
import type {
  BenchmarkCase,
  BenchmarkCaseScore,
} from "./benchmark.types.js";

function normalizeNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeNulls);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== null && item !== undefined)
      .map(([key, item]) => [key, normalizeNulls(item)]),
  );
}

function partialMatch(actual: unknown, expected: Record<string, unknown>): boolean {
  const normalizedActual = normalizeNulls(actual);
  const normalizedExpected = normalizeNulls(expected) as Record<string, unknown>;

  if (!normalizedActual || typeof normalizedActual !== "object") return false;
  const record = normalizedActual as Record<string, unknown>;

  return Object.entries(normalizedExpected).every(
    ([key, expectedValue]) =>
      JSON.stringify(record[key]) === JSON.stringify(expectedValue),
  );
}

function includesNormalized(answer: string, needle: string): boolean {
  return normalizeBenchmarkText(answer).includes(normalizeBenchmarkText(needle));
}

export function scoreBenchmarkCase(options: {
  testCase: BenchmarkCase;
  answer: string;
  toolCalls: AgentToolTrace[];
}): BenchmarkCaseScore {
  const { testCase, answer, toolCalls } = options;
  const failures: string[] = [];

  const requiredFound = testCase.requiredTools.filter((expectation) =>
    toolCalls.some((call) => call.name === expectation.name && call.outcome === "executed"),
  ).length;
  const forbiddenUsed = (testCase.forbiddenTools ?? []).filter((name) =>
    toolCalls.some((call) => call.name === name && call.outcome === "executed"),
  );

  const toolSelection =
    testCase.requiredTools.length === 0
      ? forbiddenUsed.length === 0
        ? 1
        : 0
      : Math.max(
          0,
          requiredFound / testCase.requiredTools.length - forbiddenUsed.length,
        );

  if (requiredFound !== testCase.requiredTools.length) {
    failures.push("tool_selection: nem todas as tools obrigatórias foram usadas");
  }
  if (forbiddenUsed.length > 0) {
    failures.push(`tool_selection: tools proibidas usadas: ${forbiddenUsed.join(", ")}`);
  }

  const argumentExpectations = testCase.requiredTools.filter(
    (expectation) => expectation.expectedArguments !== undefined,
  );
  const argumentHits = argumentExpectations.filter((expectation) =>
    toolCalls.some(
      (call) =>
        call.name === expectation.name &&
        call.outcome === "executed" &&
        partialMatch(call.arguments, expectation.expectedArguments ?? {}),
    ),
  ).length;
  const argumentAccuracy =
    argumentExpectations.length === 0
      ? 1
      : argumentHits / argumentExpectations.length;

  if (argumentAccuracy < 1) {
    failures.push("arguments: argumentos esperados não foram observados");
  }

  let semanticAnswer = 1;
  for (const concept of testCase.answerMustContainConcepts ?? []) {
    if (!containsBenchmarkConcept(answer, concept)) {
      semanticAnswer = 0;
      failures.push(`semantic_answer: conceito ausente: ${concept}`);
    }
  }

  for (const group of testCase.answerMustContainAny ?? []) {
    if (!group.some((needle) => includesNormalized(answer, needle))) {
      semanticAnswer = 0;
      failures.push(`semantic_answer: faltou um dos termos [${group.join(" | ")}]`);
    }
  }

  for (const forbidden of testCase.answerMustNotContain ?? []) {
    if (includesNormalized(answer, forbidden)) {
      semanticAnswer = 0;
      failures.push(`semantic_answer: claim proibido encontrado: ${forbidden}`);
    }
  }

  let numericAnswer = 1;
  for (const expectation of testCase.answerMustContainNumbers ?? []) {
    if (
      !containsExpectedNumber({
        answer,
        expected: expectation.anyOf,
        tolerance: expectation.tolerance,
      })
    ) {
      numericAnswer = 0;
      failures.push(
        `numeric_answer: nenhum valor esperado encontrado [${expectation.anyOf.join(" | ")}]`,
      );
    }
  }

  const causal = evaluateCausalGrounding(answer, toolCalls);
  const grounding = testCase.requireCausalGrounding === false ? 1 : causal.passed ? 1 : 0;
  if (grounding === 0) {
    failures.push(
      `grounding: ${causal.violations.map((violation) => violation.code).join(", ")}`,
    );
  }

  const answerRequirements = semanticAnswer === 1 && numericAnswer === 1 ? 1 : 0;

  return {
    toolSelection,
    argumentAccuracy,
    grounding,
    semanticAnswer,
    numericAnswer,
    answerRequirements,
    passed:
      toolSelection === 1 &&
      argumentAccuracy === 1 &&
      grounding === 1 &&
      semanticAnswer === 1 &&
      numericAnswer === 1,
    failures,
  };
}
