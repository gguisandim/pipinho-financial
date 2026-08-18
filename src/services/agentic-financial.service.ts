import { env } from "../config/env.js";
import {
  evaluateCausalGrounding,
  sanitizeCausalGrounding,
} from "../agent/causal-grounding.js";
import {
  evaluateFinancialQualityGrounding,
  sanitizeFinancialQualityGrounding,
} from "../agent/financial-quality-grounding.js";
import {
  evaluateFinancialProvenanceGrounding,
  sanitizeFinancialProvenanceGrounding,
} from "../agent/financial-provenance-grounding.js";
import {
  executeFinancialToolSafely,
  executeFinancialToolSafelyAsync,
  type FinancialToolExecutor,
  questionHasTemporalConstraint,
} from "../agent/financial-tool-guard.js";
import type {
  AgentTermination,
  AgentToolTrace,
  AgentTurnTrace,
} from "../agent/financial-agent.types.js";
import { financialToolDefinitions } from "../financial-tools/financial-tools.js";
import type { ToolDefinition } from "../llm/tool-calling/tool-calling.types.js";
import { buildFinancialAgentSystemPrompt } from "../llm/prompts/financial-agent.prompt.js";
import {
  FINANCIAL_AGENT_FALLBACK_SYSTEM_PROMPT,
  buildFinancialAgentFallbackPrompt,
} from "../llm/prompts/financial-agent-fallback.prompt.js";
import type { LlmProvider, LlmUsage } from "../llm/providers/llm-provider.js";
import {
  FINANCIAL_GROUNDING_REPAIR_SYSTEM_PROMPT,
  buildFinancialGroundingRepairPrompt,
} from "../llm/prompts/financial-grounding-repair.prompt.js";
import type {
  ToolCallingLlmProvider,
  ToolCallingMessage,
} from "../llm/tool-calling/tool-calling.types.js";
import {
  FINANCIAL_QUALITY_REPAIR_SYSTEM_PROMPT,
  buildFinancialQualityRepairPrompt,
} from "../llm/prompts/financial-quality-repair.prompt.js";
import {
  FINANCIAL_PROVENANCE_REPAIR_SYSTEM_PROMPT,
  buildFinancialProvenanceRepairPrompt,
} from "../llm/prompts/financial-provenance-repair.prompt.js";

function parseArgumentsForTrace(rawArguments: string): unknown {
  try {
    return rawArguments.trim() ? JSON.parse(rawArguments) : {};
  } catch {
    return rawArguments;
  }
}


function normalizeDerivedFullPeriodArguments(options: {
  question: string;
  name: string;
  rawArguments: string;
  availablePeriod: { start: string; end: string } | null;
}): string {
  if (!options.availablePeriod || questionHasTemporalConstraint(options.question)) {
    return options.rawArguments;
  }
  if (options.name === "get_financial_period") return options.rawArguments;

  try {
    const parsed = options.rawArguments.trim()
      ? JSON.parse(options.rawArguments) as Record<string, unknown>
      : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return options.rawArguments;
    }

    if (
      parsed.startDate === options.availablePeriod.start &&
      parsed.endDate === options.availablePeriod.end
    ) {
      delete parsed.startDate;
      delete parsed.endDate;
      return JSON.stringify(parsed);
    }
  } catch {
    return options.rawArguments;
  }

  return options.rawArguments;
}

function usageSum(usages: LlmUsage[]): LlmUsage {
  const values = (key: keyof LlmUsage) => usages.map((usage) => usage[key]);
  const sum = (numbers: Array<number | undefined>) =>
    numbers.every((value) => value === undefined)
      ? undefined
      : numbers.reduce<number>((total, value) => total + (value ?? 0), 0);

  return {
    promptTokens: sum(values("promptTokens")),
    completionTokens: sum(values("completionTokens")),
    totalTokens: sum(values("totalTokens")),
  };
}

function defaultReferenceDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export class AgenticFinancialService {
  constructor(
    private readonly llm: ToolCallingLlmProvider,
    private readonly fallbackLlm: LlmProvider,
    private readonly options: {
      maxIterations?: number;
      maxToolCalls?: number;
      referenceDate?: string;
      toolDefinitions?: ToolDefinition[];
      toolExecutor?: FinancialToolExecutor;
      systemPromptBuilder?: (referenceDate: string) => string;
    } = {},
  ) {}

  async answer(question: string) {
    const maxIterations = this.options.maxIterations ?? env.AGENT_MAX_ITERATIONS;
    const maxToolCalls = this.options.maxToolCalls ?? env.AGENT_MAX_TOOL_CALLS;
    const referenceDate = this.options.referenceDate ?? defaultReferenceDate();

    const toolDefinitions = this.options.toolDefinitions ?? financialToolDefinitions;
    const systemPromptBuilder =
      this.options.systemPromptBuilder ?? buildFinancialAgentSystemPrompt;

    const messages: ToolCallingMessage[] = [
      {
        role: "system",
        content: systemPromptBuilder(referenceDate),
      },
      { role: "user", content: question },
    ];

    const tools: AgentToolTrace[] = [];
    const turns: AgentTurnTrace[] = [];
    const seenCalls = new Set<string>();
    let termination: AgentTermination | null = null;
    let answer: string | null = null;
    let totalToolCalls = 0;
    let discoveredAvailablePeriod: { start: string; end: string } | null = null;

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      const turn = await this.llm.completeWithTools({
        messages,
        tools: toolDefinitions,
        toolChoice: iteration === 1 ? "required" : "auto",
        parallelToolCalls: true,
      });

      turns.push({
        iteration,
        model: turn.model,
        latencyMs: turn.latencyMs,
        usage: turn.usage,
        finishReason: turn.finishReason,
        toolCallCount: turn.toolCalls.length,
      });

      if (turn.toolCalls.length === 0) {
        if (turn.text?.trim()) {
          answer = turn.text.trim();
          termination = "model_answer";
          break;
        }

        termination = "empty_turn_fallback";
        break;
      }

      messages.push({
        role: "assistant",
        content: turn.text,
        toolCalls: turn.toolCalls,
      });

      for (const toolCall of turn.toolCalls) {
        totalToolCalls += 1;
        const effectiveArguments = normalizeDerivedFullPeriodArguments({
          question,
          name: toolCall.function.name,
          rawArguments: toolCall.function.arguments,
          availablePeriod: discoveredAvailablePeriod,
        });
        const parsedArguments = parseArgumentsForTrace(effectiveArguments);
        const signature = `${toolCall.function.name}:${JSON.stringify(parsedArguments)}`;

        let outcome: "executed" | "rejected";
        let result: unknown;

        if (totalToolCalls > maxToolCalls) {
          outcome = "rejected";
          result = {
            status: "tool_error",
            code: "tool_budget_exhausted",
            message: `O agente atingiu o limite de ${maxToolCalls} chamadas de ferramentas.`,
            suggestion: "Use os resultados já obtidos e produza a resposta final.",
          };
          termination = "tool_budget_fallback";
        } else if (seenCalls.has(signature)) {
          outcome = "rejected";
          result = {
            status: "tool_error",
            code: "duplicate_call",
            message:
              "Esta mesma ferramenta com os mesmos argumentos já foi executada nesta resposta.",
            suggestion:
              "Use o resultado anterior, mude os argumentos ou escolha outra ferramenta.",
          };
        } else {
          const execution = this.options.toolExecutor
            ? await executeFinancialToolSafelyAsync({
                question,
                name: toolCall.function.name,
                rawArguments: effectiveArguments,
                referenceDate,
                executor: this.options.toolExecutor,
              })
            : executeFinancialToolSafely({
                question,
                name: toolCall.function.name,
                rawArguments: effectiveArguments,
                referenceDate,
              });
          outcome = execution.status;
          result = execution.result;

          if (
            outcome === "executed" &&
            toolCall.function.name === "get_financial_period" &&
            result &&
            typeof result === "object" &&
            !Array.isArray(result)
          ) {
            const candidate = result as { status?: string; start?: unknown; end?: unknown };
            if (
              candidate.status === "ok" &&
              typeof candidate.start === "string" &&
              typeof candidate.end === "string"
            ) {
              discoveredAvailablePeriod = { start: candidate.start, end: candidate.end };
            }
          }

          // Só bloqueia repetição quando a chamada realmente executou ou quando
          // a rejeição foi determinística. Erros de execução (rede/5xx/timeout)
          // podem ser transitórios e precisam poder ser tentados novamente.
          const code =
            result && typeof result === "object" && !Array.isArray(result)
              ? (result as { code?: string }).code
              : undefined;
          if (outcome === "executed" || code !== "execution_error") {
            seenCalls.add(signature);
          }
        }

        tools.push({
          iteration,
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: parsedArguments,
          outcome,
          result,
        });

        messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          name: toolCall.function.name,
          content: JSON.stringify(result),
        });
      }

      if (termination === "tool_budget_fallback") break;
    }

    let groundingRepair: {
      model: string;
      latencyMs: number;
      usage: LlmUsage;
      applied: boolean;
    } | null = null;
    let qualityRepair: {
      model: string;
      latencyMs: number;
      usage: LlmUsage;
      applied: boolean;
    } | null = null;
    let provenanceRepair: {
      model: string;
      latencyMs: number;
      usage: LlmUsage;
      applied: boolean;
    } | null = null;
    let causalGrounding = answer
      ? evaluateCausalGrounding(answer, tools)
      : { passed: true, violations: [] };

    if (answer && !causalGrounding.passed) {
      const repair = await this.fallbackLlm.complete({
        system: FINANCIAL_GROUNDING_REPAIR_SYSTEM_PROMPT,
        user: buildFinancialGroundingRepairPrompt({
          question,
          answer,
          violations: causalGrounding.violations,
          tools,
        }),
      });

      groundingRepair = {
        model: repair.model,
        latencyMs: repair.latencyMs,
        usage: repair.usage,
        applied: true,
      };

      const repairedText = repair.text?.trim();
      if (repairedText) {
        const repairedEvaluation = evaluateCausalGrounding(repairedText, tools);
        if (repairedEvaluation.passed) {
          answer = repairedText;
          causalGrounding = repairedEvaluation;
        } else {
          answer = sanitizeCausalGrounding(repairedText, repairedEvaluation.violations);
          causalGrounding = evaluateCausalGrounding(answer, tools);
        }
      } else {
        answer = sanitizeCausalGrounding(answer, causalGrounding.violations);
        causalGrounding = evaluateCausalGrounding(answer, tools);
      }
    }

    let qualityGrounding = answer
      ? evaluateFinancialQualityGrounding(answer, tools)
      : { passed: true, violations: [] };

    if (answer && !qualityGrounding.passed) {
      const repair = await this.fallbackLlm.complete({
        system: FINANCIAL_QUALITY_REPAIR_SYSTEM_PROMPT,
        user: buildFinancialQualityRepairPrompt({
          question,
          answer,
          violations: qualityGrounding.violations,
          tools,
        }),
      });

      qualityRepair = {
        model: repair.model,
        latencyMs: repair.latencyMs,
        usage: repair.usage,
        applied: true,
      };

      const repairedText = repair.text?.trim();
      if (repairedText) {
        const repairedEvaluation = evaluateFinancialQualityGrounding(
          repairedText,
          tools,
        );
        if (repairedEvaluation.passed) {
          answer = repairedText;
          qualityGrounding = repairedEvaluation;
        } else {
          answer = sanitizeFinancialQualityGrounding(
            repairedText,
            repairedEvaluation.violations,
          );
          qualityGrounding = evaluateFinancialQualityGrounding(answer, tools);
        }
      } else {
        answer = sanitizeFinancialQualityGrounding(
          answer,
          qualityGrounding.violations,
        );
        qualityGrounding = evaluateFinancialQualityGrounding(answer, tools);
      }
    }

    let provenanceGrounding = answer
      ? evaluateFinancialProvenanceGrounding(answer, tools)
      : { passed: true, violations: [] };

    if (answer && !provenanceGrounding.passed) {
      const deterministicStartedAt = performance.now();
      const deterministicText = sanitizeFinancialProvenanceGrounding(
        answer,
        provenanceGrounding.violations,
      );
      const deterministicEvaluation = evaluateFinancialProvenanceGrounding(
        deterministicText,
        tools,
      );

      if (deterministicText && deterministicEvaluation.passed) {
        answer = deterministicText;
        provenanceGrounding = deterministicEvaluation;
        provenanceRepair = {
          model: "deterministic-provenance-sanitizer",
          latencyMs: Math.round(performance.now() - deterministicStartedAt),
          usage: {},
          applied: true,
        };
      } else {
        const repair = await this.fallbackLlm.complete({
          system: FINANCIAL_PROVENANCE_REPAIR_SYSTEM_PROMPT,
          user: buildFinancialProvenanceRepairPrompt({
            question,
            answer,
            violations: provenanceGrounding.violations,
            tools,
          }),
        });

        provenanceRepair = {
          model: repair.model,
          latencyMs: repair.latencyMs,
          usage: repair.usage,
          applied: true,
        };

        const repairedText = repair.text?.trim();
        if (repairedText) {
          const repairedEvaluation = evaluateFinancialProvenanceGrounding(
            repairedText,
            tools,
          );
          if (repairedEvaluation.passed) {
            answer = repairedText;
            provenanceGrounding = repairedEvaluation;
          } else {
            answer = sanitizeFinancialProvenanceGrounding(
              repairedText,
              repairedEvaluation.violations,
            );
            provenanceGrounding = evaluateFinancialProvenanceGrounding(answer, tools);
          }
        } else {
          answer = sanitizeFinancialProvenanceGrounding(
            answer,
            provenanceGrounding.violations,
          );
          provenanceGrounding = evaluateFinancialProvenanceGrounding(answer, tools);
        }
      }
    }

    if (!answer) {
      termination ??= "max_iterations_fallback";

      const fallback = await this.fallbackLlm.complete({
        system: FINANCIAL_AGENT_FALLBACK_SYSTEM_PROMPT,
        user: buildFinancialAgentFallbackPrompt(
          question,
          tools.map(({ iteration, name, arguments: args, outcome, result }) => ({
            iteration,
            name,
            arguments: args,
            outcome,
            result,
          })),
        ),
      });

      answer = fallback.text || "Não foi possível produzir uma resposta final.";
      causalGrounding = evaluateCausalGrounding(answer, tools);
      if (!causalGrounding.passed) {
        answer = sanitizeCausalGrounding(answer, causalGrounding.violations);
        causalGrounding = evaluateCausalGrounding(answer, tools);
      }
      qualityGrounding = evaluateFinancialQualityGrounding(answer, tools);
      if (!qualityGrounding.passed) {
        answer = sanitizeFinancialQualityGrounding(
          answer,
          qualityGrounding.violations,
        );
        qualityGrounding = evaluateFinancialQualityGrounding(answer, tools);
      }
      provenanceGrounding = evaluateFinancialProvenanceGrounding(answer, tools);
      if (!provenanceGrounding.passed) {
        answer = sanitizeFinancialProvenanceGrounding(
          answer,
          provenanceGrounding.violations,
        );
        provenanceGrounding = evaluateFinancialProvenanceGrounding(answer, tools);
      }

      return {
        question,
        referenceDate,
        answer,
        termination,
        iterations: turns.length,
        toolCalls: tools,
        turns,
        grounding: {
          causal: {
            passed: causalGrounding.passed,
            repaired: false,
            violations: causalGrounding.violations,
          },
          quality: {
            passed: qualityGrounding.passed,
            repaired: false,
            violations: qualityGrounding.violations,
          },
          provenance: {
            passed: provenanceGrounding.passed,
            repaired: false,
            violations: provenanceGrounding.violations,
          },
        },
        llm: {
          agentModel: turns.at(-1)?.model ?? "unknown",
          fallback: {
            model: fallback.model,
            latencyMs: fallback.latencyMs,
            usage: fallback.usage,
          },
          total: {
            latencyMs:
              turns.reduce((total, turn) => total + turn.latencyMs, 0) +
              fallback.latencyMs,
            usage: usageSum([...turns.map((turn) => turn.usage), fallback.usage]),
          },
        },
      };
    }

    return {
      question,
      referenceDate,
      answer,
      termination,
      iterations: turns.length,
      toolCalls: tools,
      turns,
      grounding: {
        causal: {
          passed: causalGrounding.passed,
          repaired: groundingRepair !== null,
          violations: causalGrounding.violations,
        },
        quality: {
          passed: qualityGrounding.passed,
          repaired: qualityRepair !== null,
          violations: qualityGrounding.violations,
        },
        provenance: {
          passed: provenanceGrounding.passed,
          repaired: provenanceRepair !== null,
          violations: provenanceGrounding.violations,
        },
      },
      llm: {
        agentModel: turns.at(-1)?.model ?? "unknown",
        fallback: null,
        groundingRepair,
        qualityRepair,
        provenanceRepair,
        total: {
          latencyMs:
            turns.reduce((total, turn) => total + turn.latencyMs, 0) +
            (groundingRepair?.latencyMs ?? 0) +
            (qualityRepair?.latencyMs ?? 0) +
            (provenanceRepair?.latencyMs ?? 0),
          usage: usageSum([
            ...turns.map((turn) => turn.usage),
            ...(groundingRepair ? [groundingRepair.usage] : []),
            ...(qualityRepair ? [qualityRepair.usage] : []),
            ...(provenanceRepair ? [provenanceRepair.usage] : []),
          ]),
        },
      },
    };
  }
}
