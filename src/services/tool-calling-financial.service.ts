import {
  executeFinancialTool,
  financialToolDefinitions,
} from "../financial-tools/financial-tools.js";
import { FINANCIAL_TOOL_SYSTEM_PROMPT } from "../llm/prompts/financial-tools.prompt.js";
import {
  FINANCIAL_TOOL_SYNTHESIS_SYSTEM_PROMPT,
  buildFinancialToolSynthesisPrompt,
} from "../llm/prompts/financial-tool-synthesis.prompt.js";
import type { LlmProvider } from "../llm/providers/llm-provider.js";
import type {
  ToolCallingLlmProvider,
  ToolCallingMessage,
} from "../llm/tool-calling/tool-calling.types.js";

export interface ExecutedToolTrace {
  id: string;
  name: string;
  arguments: unknown;
  result: unknown;
}

function parseArgumentsForTrace(rawArguments: string): unknown {
  try {
    return rawArguments.trim() ? JSON.parse(rawArguments) : {};
  } catch {
    return rawArguments;
  }
}

function sumUsage(
  first?: { promptTokens?: number; completionTokens?: number; totalTokens?: number },
  second?: { promptTokens?: number; completionTokens?: number; totalTokens?: number },
) {
  const add = (a?: number, b?: number) =>
    a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);

  return {
    promptTokens: add(first?.promptTokens, second?.promptTokens),
    completionTokens: add(first?.completionTokens, second?.completionTokens),
    totalTokens: add(first?.totalTokens, second?.totalTokens),
  };
}

export class ToolCallingFinancialService {
  constructor(
    private readonly llm: ToolCallingLlmProvider,
    private readonly finalLlm: LlmProvider,
  ) {}

  async answer(question: string) {
    const messages: ToolCallingMessage[] = [
      {
        role: "system",
        content: FINANCIAL_TOOL_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: question,
      },
    ];

    const planningTurn = await this.llm.completeWithTools({
      messages,
      tools: financialToolDefinitions,
      toolChoice: "auto",
      parallelToolCalls: true,
    });

    if (planningTurn.toolCalls.length === 0) {
      return {
        question,
        answer:
          planningTurn.text ??
          "O modelo não chamou ferramentas nem retornou uma resposta textual.",
        toolCalls: [] as ExecutedToolTrace[],
        llm: {
          provider: planningTurn.provider,
          model: planningTurn.model,
          planning: {
            latencyMs: planningTurn.latencyMs,
            usage: planningTurn.usage,
            finishReason: planningTurn.finishReason,
          },
          final: null,
          total: {
            latencyMs: planningTurn.latencyMs,
            usage: planningTurn.usage,
          },
        },
      };
    }

    messages.push({
      role: "assistant",
      content: planningTurn.text,
      toolCalls: planningTurn.toolCalls,
    });

    const executedTools: ExecutedToolTrace[] = [];

    for (const toolCall of planningTurn.toolCalls) {
      const result = executeFinancialTool(
        toolCall.function.name,
        toolCall.function.arguments,
      );

      executedTools.push({
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: parseArgumentsForTrace(toolCall.function.arguments),
        result,
      });

      messages.push({
        role: "tool",
        toolCallId: toolCall.id,
        name: toolCall.function.name,
        content: JSON.stringify(result),
      });
    }

    // Ciclo 3 encerra após UMA rodada de ferramentas.
    // A síntese final usa uma chamada NOVA e limpa, sem o histórico de
    // assistant.tool_calls / role=tool. Isso evita que modelos GPT-OSS
    // continuem tentando chamar ferramentas quando a API já está em
    // tool_choice="none" (o padrão quando não há tools), cenário que a
    // própria Groq documenta como possível em alguns modelos.
    const finalTurn = await this.finalLlm.complete({
      system: FINANCIAL_TOOL_SYNTHESIS_SYSTEM_PROMPT,
      user: buildFinancialToolSynthesisPrompt(
        question,
        executedTools.map(({ name, arguments: args, result }) => ({
          name,
          arguments: args,
          result,
        })),
      ),
    });

    return {
      question,
      answer: finalTurn.text || "A Groq retornou uma resposta final vazia.",
      toolCalls: executedTools,
      llm: {
        provider: finalTurn.provider,
        model: finalTurn.model,
        planning: {
          latencyMs: planningTurn.latencyMs,
          usage: planningTurn.usage,
          finishReason: planningTurn.finishReason,
        },
        final: {
          latencyMs: finalTurn.latencyMs,
          usage: finalTurn.usage,
          finishReason: null,
        },
        total: {
          latencyMs: planningTurn.latencyMs + finalTurn.latencyMs,
          usage: sumUsage(planningTurn.usage, finalTurn.usage),
        },
      },
    };
  }
}
