import { describe, expect, it } from "vitest";
import {
  conversationBenchmarkCases,
  conversationBenchmarkReferenceDate,
} from "../src/evaluation/conversation-benchmark.corpus.js";
import {
  evaluateConversationBenchmarkCase,
  summarizeConversationBenchmark,
} from "../src/evaluation/conversation-benchmark.js";

describe("Cycle 11.4 conversational benchmark", () => {
  for (const testCase of conversationBenchmarkCases) {
    it(`${testCase.id}: ${testCase.question}`, () => {
      const result = evaluateConversationBenchmarkCase({
        testCase,
        referenceDate: conversationBenchmarkReferenceDate,
      });
      expect(result.failures, result.failures.join("\n")).toEqual([]);
      expect(result.passed).toBe(true);
    });
  }

  it("mantém 100% de acerto no corpus determinístico", () => {
    const results = conversationBenchmarkCases.map((testCase) =>
      evaluateConversationBenchmarkCase({
        testCase,
        referenceDate: conversationBenchmarkReferenceDate,
      }),
    );
    const summary = summarizeConversationBenchmark(results);
    expect(summary.failed).toBe(0);
    expect(summary.passRatePct).toBe(100);
  });
});
