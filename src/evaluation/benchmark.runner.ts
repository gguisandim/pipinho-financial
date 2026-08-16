import { benchmarkCases } from "./benchmark.cases.js";
import { writeBenchmarkReport, summarizeBenchmark } from "./benchmark.report.js";
import { scoreBenchmarkCase } from "./benchmark.scoring.js";
import { classifyBenchmarkError } from "./benchmark.errors.js";
import { createBenchmarkProvider } from "./providers/provider.factory.js";
import type {
  BenchmarkCase,
  BenchmarkCaseResult,
  BenchmarkProviderId,
  BenchmarkReport,
} from "./benchmark.types.js";

export interface BenchmarkProgressEvent {
  phase: "case_start" | "case_complete" | "delay" | "rate_limit";
  current: number;
  total: number;
  run: number;
  caseId: string;
  provider: BenchmarkProviderId;
  passed?: boolean;
  latencyMs?: number;
  tokens?: number | null;
  waitMs?: number;
  executionStatus?: import("./benchmark.types.js").BenchmarkExecutionStatus;
  error?: string;
}

export interface RunBenchmarkOptions {
  provider?: BenchmarkProviderId;
  runs?: number;
  caseIds?: string[];
  delayMs?: number;
  referenceDate?: string;
  onProgress?: (event: BenchmarkProgressEvent) => void;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(error: unknown): number | null {
  const candidate = error as {
    status?: number;
    headers?: { get?: (name: string) => string | null };
  };

  if (candidate.status !== 429) return null;
  const raw = candidate.headers?.get?.("retry-after");
  if (!raw) return 30000;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? Math.max(1000, Math.ceil(seconds * 1000)) : 30000;
}

async function answerWithRateLimitRetry(
  service: ReturnType<typeof createBenchmarkProvider>["service"],
  question: string,
  maxRetries = 2,
  onRateLimit?: (waitMs: number) => void,
) {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await service.answer(question);
    } catch (error) {
      const waitMs = retryAfterMs(error);
      if (waitMs === null || attempt === maxRetries) throw error;
      onRateLimit?.(waitMs);
      await sleep(waitMs);
    }
  }

  throw new Error("Falha inesperada no retry do benchmark.");
}

export async function runBenchmark(options: RunBenchmarkOptions = {}) {
  const provider = options.provider ?? "groq";
  const runs = options.runs ?? 1;
  const referenceDate = options.referenceDate ?? "2026-08-16";
  const selectedCases = options.caseIds?.length
    ? benchmarkCases.filter((testCase) => options.caseIds?.includes(testCase.id))
    : benchmarkCases;

  if (selectedCases.length === 0) {
    throw new Error("Nenhum caso de benchmark corresponde aos filtros informados.");
  }

  const providerBundle = createBenchmarkProvider({ provider, referenceDate });
  const delayMs = options.delayMs ?? providerBundle.defaultDelayMs;
  const results: BenchmarkCaseResult[] = [];
  const totalExecutions = runs * selectedCases.length;
  let currentExecution = 0;

  for (let run = 1; run <= runs; run += 1) {
    for (let index = 0; index < selectedCases.length; index += 1) {
      const testCase: BenchmarkCase = selectedCases[index];
      currentExecution += 1;
      options.onProgress?.({
        phase: "case_start",
        current: currentExecution,
        total: totalExecutions,
        run,
        caseId: testCase.id,
        provider,
      });

      try {
        const result = await answerWithRateLimitRetry(
          providerBundle.service,
          testCase.question,
          2,
          (waitMs) =>
            options.onProgress?.({
              phase: "rate_limit",
              current: currentExecution,
              total: totalExecutions,
              run,
              caseId: testCase.id,
              provider,
              waitMs,
            }),
        );
        const score = scoreBenchmarkCase({
          testCase,
          answer: result.answer,
          toolCalls: result.toolCalls,
        });

        results.push({
          run,
          caseId: testCase.id,
          description: testCase.description,
          question: testCase.question,
          answer: result.answer,
          provider,
          model: result.llm.agentModel,
          models: [...new Set([
            ...result.turns.map((turn) => turn.model),
            ...(result.llm.groundingRepair?.model ? [result.llm.groundingRepair.model] : []),
            ...(result.llm.fallback?.model ? [result.llm.fallback.model] : []),
          ])],
          termination: result.termination,
          toolCalls: result.toolCalls.map(({ name, arguments: args, outcome, result: toolResult }) => ({
            name,
            arguments: args,
            outcome,
            result: toolResult,
          })),
          iterations: result.iterations,
          latencyMs: result.llm.total.latencyMs,
          tokens: result.llm.total.usage.totalTokens ?? null,
          causalGrounding: result.grounding.causal,
          executionStatus: "completed",
          score,
        });

        options.onProgress?.({
          phase: "case_complete",
          current: currentExecution,
          total: totalExecutions,
          run,
          caseId: testCase.id,
          provider,
          passed: score.passed,
          latencyMs: result.llm.total.latencyMs,
          tokens: result.llm.total.usage.totalTokens ?? null,
          executionStatus: "completed",
        });
      } catch (error) {
        const executionStatus = classifyBenchmarkError(error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        const countsAsModelQualityFailure = executionStatus === "model_protocol_error";

        results.push({
          run,
          caseId: testCase.id,
          description: testCase.description,
          question: testCase.question,
          answer: "",
          error: errorMessage,
          executionStatus,
          provider,
          model: providerBundle.configuredModel,
          models: [providerBundle.configuredModel],
          termination: null,
          toolCalls: [],
          iterations: 0,
          latencyMs: 0,
          tokens: null,
          causalGrounding: { passed: false, repaired: false, violations: [] },
          score: {
            toolSelection: 0,
            argumentAccuracy: 0,
            grounding: 0,
            semanticAnswer: 0,
            numericAnswer: 0,
            answerRequirements: 0,
            passed: false,
            failures: [
              `${executionStatus}: ${errorMessage}`,
              ...(countsAsModelQualityFailure
                ? ["A falha de protocolo conta como erro de qualidade do modelo."]
                : []),
            ],
          },
        });

        options.onProgress?.({
          phase: "case_complete",
          current: currentExecution,
          total: totalExecutions,
          run,
          caseId: testCase.id,
          provider,
          passed: false,
          latencyMs: 0,
          tokens: null,
          executionStatus,
          error: errorMessage,
        });
      }

      if (delayMs > 0 && !(run === runs && index === selectedCases.length - 1)) {
        options.onProgress?.({
          phase: "delay",
          current: currentExecution,
          total: totalExecutions,
          run,
          caseId: testCase.id,
          provider,
          waitMs: delayMs,
        });
        await sleep(delayMs);
      }
    }
  }

  const generatedAt = new Date().toISOString();
  const report: BenchmarkReport = {
    generatedAt,
    summary: summarizeBenchmark({
      provider,
      configuredModel: providerBundle.configuredModel,
      referenceDate,
      runs,
      caseCount: selectedCases.length,
      results,
    }),
    results,
  };

  const paths = await writeBenchmarkReport(report);
  return { report, paths };
}
