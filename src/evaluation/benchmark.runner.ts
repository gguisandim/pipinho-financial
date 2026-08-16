import { env } from "../config/env.js";
import { GroqProvider } from "../llm/providers/groq.provider.js";
import { GroqToolCallingProvider } from "../llm/tool-calling/groq-tool-calling.provider.js";
import { AgenticFinancialService } from "../services/agentic-financial.service.js";
import { benchmarkCases } from "./benchmark.cases.js";
import { writeBenchmarkReport, summarizeBenchmark } from "./benchmark.report.js";
import { scoreBenchmarkCase } from "./benchmark.scoring.js";
import type {
  BenchmarkCase,
  BenchmarkCaseResult,
  BenchmarkReport,
} from "./benchmark.types.js";

export interface BenchmarkProgressEvent {
  phase: "case_start" | "case_complete" | "delay" | "rate_limit";
  current: number;
  total: number;
  run: number;
  caseId: string;
  passed?: boolean;
  latencyMs?: number;
  tokens?: number | null;
  waitMs?: number;
}

export interface RunBenchmarkOptions {
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
  service: AgenticFinancialService,
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
  const runs = options.runs ?? 1;
  const delayMs = options.delayMs ?? 25000;
  const referenceDate = options.referenceDate ?? "2026-08-16";
  const selectedCases = options.caseIds?.length
    ? benchmarkCases.filter((testCase) => options.caseIds?.includes(testCase.id))
    : benchmarkCases;

  if (selectedCases.length === 0) {
    throw new Error("Nenhum caso de benchmark corresponde aos filtros informados.");
  }

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
      });
      const service = new AgenticFinancialService(
        new GroqToolCallingProvider(env.GROQ_AGENT_MODEL),
        new GroqProvider(env.GROQ_FINAL_MODEL),
        { referenceDate },
      );

      try {
        const result = await answerWithRateLimitRetry(
          service,
          testCase.question,
          2,
          (waitMs) =>
            options.onProgress?.({
              phase: "rate_limit",
              current: currentExecution,
              total: totalExecutions,
              run,
              caseId: testCase.id,
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
          score,
        });

        options.onProgress?.({
          phase: "case_complete",
          current: currentExecution,
          total: totalExecutions,
          run,
          caseId: testCase.id,
          passed: score.passed,
          latencyMs: result.llm.total.latencyMs,
          tokens: result.llm.total.usage.totalTokens ?? null,
        });
      } catch (error) {
        results.push({
          run,
          caseId: testCase.id,
          description: testCase.description,
          question: testCase.question,
          answer: "",
          error: error instanceof Error ? error.message : String(error),
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
            answerRequirements: 0,
            passed: false,
            failures: [
              `execution_error: ${error instanceof Error ? error.message : String(error)}`,
            ],
          },
        });

        options.onProgress?.({
          phase: "case_complete",
          current: currentExecution,
          total: totalExecutions,
          run,
          caseId: testCase.id,
          passed: false,
          latencyMs: 0,
          tokens: null,
        });
      }

      if (delayMs > 0 && !(run === runs && index === selectedCases.length - 1)) {
        options.onProgress?.({
          phase: "delay",
          current: currentExecution,
          total: totalExecutions,
          run,
          caseId: testCase.id,
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
      model: env.GROQ_AGENT_MODEL,
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
