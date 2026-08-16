import type { FinancialToolName } from "../financial-tools/financial-tools.js";

export interface BenchmarkToolExpectation {
  name: FinancialToolName;
  expectedArguments?: Record<string, unknown>;
}

export interface BenchmarkCase {
  id: string;
  description: string;
  question: string;
  requiredTools: BenchmarkToolExpectation[];
  forbiddenTools?: FinancialToolName[];
  answerMustContainAny?: string[][];
  answerMustNotContain?: string[];
  requireCausalGrounding?: boolean;
}

export interface BenchmarkCaseScore {
  toolSelection: number;
  argumentAccuracy: number;
  grounding: number;
  answerRequirements: number;
  passed: boolean;
  failures: string[];
}

export interface BenchmarkCaseResult {
  run: number;
  caseId: string;
  description: string;
  question: string;
  answer: string;
  error?: string;
  termination: string | null;
  toolCalls: Array<{
    name: string;
    arguments: unknown;
    outcome: string;
    result: unknown;
  }>;
  iterations: number;
  latencyMs: number;
  tokens: number | null;
  causalGrounding: {
    passed: boolean;
    repaired: boolean;
    violations: unknown[];
  };
  score: BenchmarkCaseScore;
}

export interface BenchmarkSummary {
  model: string;
  referenceDate: string;
  runs: number;
  caseCount: number;
  executionCount: number;
  passed: number;
  passRatePct: number;
  toolSelectionAccuracyPct: number;
  argumentAccuracyPct: number;
  groundingAccuracyPct: number;
  causalRepairRatePct: number;
  answerRequirementAccuracyPct: number;
  averageIterations: number;
  averageToolCalls: number;
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  averageTokens: number;
  totalTokens: number;
}

export interface BenchmarkReport {
  generatedAt: string;
  summary: BenchmarkSummary;
  results: BenchmarkCaseResult[];
}
