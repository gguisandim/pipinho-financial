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
  evaluateFinancialEvidenceGrounding,
  sanitizeFinancialEvidenceGrounding,
} from "../agent/financial-evidence-grounding.js";
import {
  executeFinancialToolSafelyAsync,
  questionHasTemporalConstraint,
  type FinancialToolExecutor,
} from "../agent/financial-tool-guard.js";
import type {
  AgentTermination,
  AgentToolTrace,
  AgentTurnTrace,
} from "../agent/financial-agent.types.js";
import {
  normalizeFinancialToolArguments,
} from "../agent/financial-tool-argument-normalizer.js";
import {
  buildContextualRoutingQuestion,
  sanitizeConversationHistory,
  sanitizeConversationMemorySummary,
  type ConversationHistoryMessage,
} from "../agent/conversation-context.js";
import type { ToolDefinition } from "../llm/tool-calling/tool-calling.types.js";
import { sanitizeRoutineContext, type RoutineContextSnapshot } from "../routine/routine-context.js";
import { isRoutineToolName, routineToolDefinitions, RoutineToolExecutor } from "../routine/routine-tools.js";
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
import {
  FINANCIAL_FAST_PATH_SYNTHESIS_SYSTEM_PROMPT,
  buildFinancialFastPathSynthesisPrompt,
} from "../llm/prompts/financial-fast-path-synthesis.prompt.js";

function parseArgumentsForTrace(rawArguments: string): unknown {
  try {
    return rawArguments.trim() ? JSON.parse(rawArguments) : {};
  } catch {
    return rawArguments;
  }
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
      toolDefinitions: ToolDefinition[];
      toolDefinitionsSelector?: (
        question: string,
        definitions: ToolDefinition[],
      ) => ToolDefinition[];
      toolExecutor: FinancialToolExecutor;
      systemPromptBuilder: (referenceDate: string) => string;
      deterministicToolPlanner?: (
        question: string,
        referenceDate: string,
      ) => { name: string; rawArguments?: string } | null;
    },
  ) {}

  async answer(
    question: string,
    context: {
      history?: ConversationHistoryMessage[];
      conversationId?: string;
      memorySummary?: string;
      routineContext?: RoutineContextSnapshot;
    } = {},
  ) {
    const maxIterations = this.options.maxIterations ?? env.AGENT_MAX_ITERATIONS;
    const maxToolCalls = this.options.maxToolCalls ?? env.AGENT_MAX_TOOL_CALLS;
    const referenceDate = this.options.referenceDate ?? defaultReferenceDate();
    const history = sanitizeConversationHistory(context.history, 10);
    const memorySummary = sanitizeConversationMemorySummary(context.memorySummary);
    const routingQuestion = buildContextualRoutingQuestion(question, history, memorySummary);
    const groundingQuestion = questionHasTemporalConstraint(question)
      ? question
      : routingQuestion;

    const routineContext = sanitizeRoutineContext(context.routineContext);
    const routineExecutor = new RoutineToolExecutor(routineContext, this.options.toolExecutor, referenceDate);
    const runtimeToolExecutor: FinancialToolExecutor = (name, rawArguments) =>
      isRoutineToolName(name) ? routineExecutor.execute(name, rawArguments) : this.options.toolExecutor(name, rawArguments);
    const allToolDefinitions = [...this.options.toolDefinitions, ...routineToolDefinitions];
    const toolDefinitions = this.options.toolDefinitionsSelector
      ? this.options.toolDefinitionsSelector(routingQuestion, allToolDefinitions)
      : allToolDefinitions;
    const systemPromptBuilder = this.options.systemPromptBuilder;

    const messages: ToolCallingMessage[] = [
      {
        role: "system",
        content: systemPromptBuilder(referenceDate),
      },
      ...(memorySummary && history.length === 0 && routingQuestion !== question
        ? [
            {
              role: "system" as const,
              content: `Memória persistente para resolução de contexto. Ela contém apenas perguntas anteriores do usuário e não é evidência financeira: ${memorySummary}`,
            },
          ]
        : []),
      ...history.map<ToolCallingMessage>((message) =>
        message.role === "assistant"
          ? { role: "assistant", content: message.content }
          : { role: "user", content: message.content },
      ),
      { role: "user", content: question },
    ];

    const tools: AgentToolTrace[] = [];
    const turns: AgentTurnTrace[] = [];
    const seenCalls = new Set<string>();
    let termination: AgentTermination | null = null;
    let answer: string | null = null;
    let totalToolCalls = 0;
    let discoveredAvailablePeriod: { start: string; end: string } | null = null;
    let executionMode: "fast_path" | "agent" | "conversation" =
      toolDefinitions.length === 0 ? "conversation" : "agent";
    let startIteration = 1;
    let fastPathSynthesis: {
      toolName: string;
      arguments: unknown;
      result: unknown;
    } | null = null;

    // Fast path: quando o router determinístico conhece exatamente uma tool,
    // executamos essa tool localmente antes de envolver o modelo. O LLM fica
    // responsável apenas pela síntese final. Isso reduz uma chamada remota,
    // elimina tool calls redundantes e mantém o mesmo pipeline de grounding.
    const deterministicPlan = this.options.deterministicToolPlanner?.(
      routingQuestion,
      referenceDate,
    );

    if (
      deterministicPlan &&
      toolDefinitions.some(
        (definition) => definition.function.name === deterministicPlan.name,
      )
    ) {
      const rawArguments = deterministicPlan.rawArguments ?? "{}";
      const effectiveArguments = normalizeFinancialToolArguments({
        question: groundingQuestion,
        name: deterministicPlan.name,
        rawArguments,
        referenceDate,
        availablePeriod: null,
      });
      const parsedArguments = parseArgumentsForTrace(effectiveArguments);
      const execution = await executeFinancialToolSafelyAsync({
        question: groundingQuestion,
        name: deterministicPlan.name,
        rawArguments: effectiveArguments,
        referenceDate,
        executor: runtimeToolExecutor,
      });

      if (execution.status === "executed") {
        executionMode = "fast_path";
        startIteration = 2;
        totalToolCalls = 1;
        const syntheticId = "deterministic_route_1";
        const signature = `${deterministicPlan.name}:${JSON.stringify(parsedArguments)}`;
        seenCalls.add(signature);

        tools.push({
          iteration: 1,
          id: syntheticId,
          name: deterministicPlan.name,
          arguments: parsedArguments,
          outcome: "executed",
          result: execution.result,
        });
        turns.push({
          iteration: 1,
          model: "deterministic-tool-router",
          latencyMs: 0,
          usage: {},
          finishReason: "tool_calls",
          toolCallCount: 1,
        });

        messages.push({
          role: "assistant",
          content: null,
          toolCalls: [
            {
              id: syntheticId,
              type: "function",
              function: {
                name: deterministicPlan.name,
                arguments: effectiveArguments,
              },
            },
          ],
        });
        messages.push({
          role: "tool",
          toolCallId: syntheticId,
          name: deterministicPlan.name,
          content: JSON.stringify(execution.result),
        });

        fastPathSynthesis = {
          toolName: deterministicPlan.name,
          arguments: parsedArguments,
          result: execution.result,
        };

        if (
          deterministicPlan.name === "get_financial_period" &&
          execution.result &&
          typeof execution.result === "object" &&
          !Array.isArray(execution.result)
        ) {
          const candidate = execution.result as {
            status?: string;
            start?: unknown;
            end?: unknown;
          };
          if (
            candidate.status === "ok" &&
            typeof candidate.start === "string" &&
            typeof candidate.end === "string"
          ) {
            discoveredAvailablePeriod = {
              start: candidate.start,
              end: candidate.end,
            };
          }
        }
      }
    }

    if (executionMode === "fast_path" && fastPathSynthesis) {
      // No fast path, não usamos o provider de tool-calling para a síntese.
      // O router já decidiu e executou a única tool necessária; reexpor schemas
      // ao modelo adicionava tokens e permitia tool calls espúrias mesmo com
      // toolChoice=none em alguns providers. A síntese usa o provider textual
      // simples com um contrato de evidência muito menor.
      const synthesis = await this.fallbackLlm.complete({
        system: FINANCIAL_FAST_PATH_SYNTHESIS_SYSTEM_PROMPT,
        user: buildFinancialFastPathSynthesisPrompt({
          question,
          toolName: fastPathSynthesis.toolName,
          arguments: fastPathSynthesis.arguments,
          result: fastPathSynthesis.result,
        }),
      });

      turns.push({
        iteration: 2,
        model: synthesis.model,
        latencyMs: synthesis.latencyMs,
        usage: synthesis.usage,
        finishReason: "stop",
        toolCallCount: 0,
      });
      answer = synthesis.text?.trim() || null;
      termination = answer ? "model_answer" : "empty_turn_fallback";
      startIteration = maxIterations + 1;
    }

    for (let iteration = startIteration; iteration <= maxIterations; iteration += 1) {
      const turn = await this.llm.completeWithTools({
        messages,
        tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
        toolChoice:
          toolDefinitions.length === 0
            ? "auto"
            : executionMode === "fast_path"
              ? "none"
              : iteration === 1
                ? "required"
                : "auto",
        parallelToolCalls: toolDefinitions.length > 0 && executionMode !== "fast_path",
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
        const effectiveArguments = normalizeFinancialToolArguments({
          question: groundingQuestion,
          name: toolCall.function.name,
          rawArguments: toolCall.function.arguments,
          referenceDate,
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
          const execution = await executeFinancialToolSafelyAsync({
            question: groundingQuestion,
            name: toolCall.function.name,
            rawArguments: effectiveArguments,
            referenceDate,
            executor: runtimeToolExecutor,
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
    let evidenceRepair: {
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

    let evidenceGrounding = answer
      ? evaluateFinancialEvidenceGrounding(answer, tools)
      : { passed: true, violations: [] };

    if (answer && !evidenceGrounding.passed) {
      const startedAt = performance.now();
      answer = sanitizeFinancialEvidenceGrounding(
        answer,
        tools,
        evidenceGrounding.violations,
      );
      evidenceGrounding = evaluateFinancialEvidenceGrounding(answer, tools);
      evidenceRepair = {
        model: "deterministic-evidence-sanitizer",
        latencyMs: Math.round(performance.now() - startedAt),
        usage: {},
        applied: true,
      };
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
      evidenceGrounding = evaluateFinancialEvidenceGrounding(answer, tools);
      if (!evidenceGrounding.passed) {
        answer = sanitizeFinancialEvidenceGrounding(
          answer,
          tools,
          evidenceGrounding.violations,
        );
        evidenceGrounding = evaluateFinancialEvidenceGrounding(answer, tools);
      }

      return {
        question,
        referenceDate,
        executionMode,
        conversation: {
          id: context.conversationId ?? null,
          historyMessagesUsed: history.length,
          contextualRouting: routingQuestion !== question,
        },
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
          evidence: {
            passed: evidenceGrounding.passed,
            repaired: false,
            violations: evidenceGrounding.violations,
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
      executionMode,
      conversation: {
        id: context.conversationId ?? null,
        historyMessagesUsed: history.length,
        contextualRouting: routingQuestion !== question,
      },
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
        evidence: {
          passed: evidenceGrounding.passed,
          repaired: evidenceRepair !== null,
          violations: evidenceGrounding.violations,
        },
      },
      llm: {
        agentModel: turns.at(-1)?.model ?? "unknown",
        fallback: null,
        groundingRepair,
        qualityRepair,
        provenanceRepair,
        evidenceRepair,
        total: {
          latencyMs:
            turns.reduce((total, turn) => total + turn.latencyMs, 0) +
            (groundingRepair?.latencyMs ?? 0) +
            (qualityRepair?.latencyMs ?? 0) +
            (provenanceRepair?.latencyMs ?? 0) +
            (evidenceRepair?.latencyMs ?? 0),
          usage: usageSum([
            ...turns.map((turn) => turn.usage),
            ...(groundingRepair ? [groundingRepair.usage] : []),
            ...(qualityRepair ? [qualityRepair.usage] : []),
            ...(provenanceRepair ? [provenanceRepair.usage] : []),
            ...(evidenceRepair ? [evidenceRepair.usage] : []),
          ]),
        },
      },
    };
  }
}
