import type { FinancialToolName } from "../financial-tools/financial-tools.js";

export type BenchmarkProviderId = "groq" | "openrouter";

export type BenchmarkExecutionStatus =
  | "completed"
  | "model_protocol_error"
  | "provider_error"
  | "harness_error";

export type BenchmarkConcept =
  | "cash_flow"
  | "data_absence"
  | "investments"
  | "institution"
  | "housing"
  | "rent";

export interface BenchmarkToolExpectation {
  name: FinancialToolName;
  expectedArguments?: Record<string, unknown>;
}

export interface BenchmarkNumericExpectation {
  /** Um grupo passa quando pelo menos um dos valores esperados aparece na resposta. */
  anyOf: number[];
  /** Tolerância absoluta. Útil para percentuais/arredondamentos. */
  tolerance?: number;
}

export interface BenchmarkCase {
  id: string;
  description: string;
  question: string;
  requiredTools: BenchmarkToolExpectation[];
  forbiddenTools?: FinancialToolName[];

  /** Conceitos avaliados semanticamente por padrões determinísticos, não por frase literal. */
  answerMustContainConcepts?: BenchmarkConcept[];

  /** Mantido para termos específicos que não justificam um conceito próprio. */
  answerMustContainAny?: string[][];

  /** Valores são extraídos e normalizados antes da comparação. */
  answerMustContainNumbers?: BenchmarkNumericExpectation[];

  answerMustNotContain?: string[];
  requireCausalGrounding?: boolean;
}

export interface BenchmarkCaseScore {
  toolSelection: number;
  argumentAccuracy: number;
  grounding: number;
  semanticAnswer: number;
  numericAnswer: number;
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
  executionStatus: BenchmarkExecutionStatus;
  provider: BenchmarkProviderId;
  model: string;
  models: string[];
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
  provider: BenchmarkProviderId;
  configuredModel: string;
  observedModels: string[];
  referenceDate: string;
  runs: number;
  caseCount: number;

  /** Total solicitado, incluindo falhas externas. */
  executionCount: number;
  /** Execuções que produziram resposta e puderam ser avaliadas integralmente. */
  completedExecutions: number;
  /** Falhas de protocolo do próprio modelo, como tool call irrecuperavelmente malformada. */
  modelProtocolErrors: number;
  /** Falhas externas de API/rede/rate limit após retries. */
  providerErrors: number;
  /** Falhas internas do harness/aplicação. */
  harnessErrors: number;
  /** completed + model_protocol_error. É o denominador das métricas de qualidade. */
  qualityExecutionCount: number;
  /** Percentual de execuções que não falharam por indisponibilidade externa do provider. */
  providerAvailabilityPct: number;

  passed: number;
  passRatePct: number;
  toolSelectionAccuracyPct: number;
  argumentAccuracyPct: number;
  groundingAccuracyPct: number;
  causalRepairRatePct: number;
  semanticAnswerAccuracyPct: number;
  numericAnswerAccuracyPct: number;
  answerRequirementAccuracyPct: number;
  averageIterations: number;
  averageToolCalls: number;
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  tokenCoveragePct: number;
  averageTokens: number | null;
  totalTokens: number | null;
}

export interface BenchmarkReport {
  generatedAt: string;
  summary: BenchmarkSummary;
  results: BenchmarkCaseResult[];
}

export interface BenchmarkComparisonReport {
  generatedAt: string;
  providers: BenchmarkProviderId[];
  reports: BenchmarkReport[];
}
