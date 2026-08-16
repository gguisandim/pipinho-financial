import { describe, expect, it } from "vitest";
import { summarizeBenchmark } from "../src/evaluation/benchmark.report.js";
import type { BenchmarkCaseResult } from "../src/evaluation/benchmark.types.js";

function result(
  status: BenchmarkCaseResult["executionStatus"],
  passed: boolean,
): BenchmarkCaseResult {
  return {
    run: 1,
    caseId: `case-${status}`,
    description: "teste",
    question: "teste",
    answer: passed ? "ok" : "",
    executionStatus: status,
    provider: "groq",
    model: "model",
    models: ["model"],
    termination: passed ? "model_answer" : null,
    toolCalls: [],
    iterations: passed ? 2 : 0,
    latencyMs: passed ? 100 : 0,
    tokens: passed ? 1000 : null,
    causalGrounding: { passed, repaired: false, violations: [] },
    score: {
      toolSelection: passed ? 1 : 0,
      argumentAccuracy: passed ? 1 : 0,
      grounding: passed ? 1 : 0,
      semanticAnswer: passed ? 1 : 0,
      numericAnswer: passed ? 1 : 0,
      answerRequirements: passed ? 1 : 0,
      passed,
      failures: passed ? [] : ["erro"],
    },
  };
}

describe("benchmark summary", () => {
  it("não reduz accuracy por falha externa do provider", () => {
    const summary = summarizeBenchmark({
      provider: "groq",
      configuredModel: "model",
      referenceDate: "2026-08-16",
      runs: 1,
      caseCount: 2,
      results: [result("completed", true), result("provider_error", false)],
    });

    expect(summary.executionCount).toBe(2);
    expect(summary.completedExecutions).toBe(1);
    expect(summary.providerErrors).toBe(1);
    expect(summary.providerAvailabilityPct).toBe(50);
    expect(summary.passRatePct).toBe(100);
    expect(summary.toolSelectionAccuracyPct).toBe(100);
  });

  it("mantém falha de protocolo do modelo dentro das métricas de qualidade", () => {
    const summary = summarizeBenchmark({
      provider: "groq",
      configuredModel: "model",
      referenceDate: "2026-08-16",
      runs: 1,
      caseCount: 2,
      results: [result("completed", true), result("model_protocol_error", false)],
    });

    expect(summary.qualityExecutionCount).toBe(2);
    expect(summary.modelProtocolErrors).toBe(1);
    expect(summary.passRatePct).toBe(50);
    expect(summary.toolSelectionAccuracyPct).toBe(50);
  });
});
