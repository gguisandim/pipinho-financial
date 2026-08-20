import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { registerApiAuthHook, type ApiAuthOptions } from "../http/api-auth.js";
import { safeErrorForLog } from "../http/safe-error.js";
import { createGroqRealFinancialAgentService } from "../services/real-financial-agent-groq.factory.js";

const historyMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(1000),
  })
  .strict();

const requestSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    conversationId: z.string().trim().min(8).max(100).optional(),
    history: z.array(historyMessageSchema).max(10).optional().default([]),
  })
  .strict();

export interface AssistantRouteOptions extends ApiAuthOptions {
  agentService?: Pick<ReturnType<typeof createGroqRealFinancialAgentService>, "answer">;
}

let realAgent: ReturnType<typeof createGroqRealFinancialAgentService> | null = null;

function defaultAgent() {
  if (!realAgent) realAgent = createGroqRealFinancialAgentService();
  return realAgent;
}

export async function assistantRoutes(
  app: FastifyInstance,
  options: AssistantRouteOptions = {},
) {
  registerApiAuthHook(app, options);

  app.post("/api/v1/assistant", async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_request",
        details: parsed.error.flatten(),
      });
    }

    try {
      const agent = options.agentService ?? defaultAgent();
      const result = await agent.answer(parsed.data.question, {
        conversationId: parsed.data.conversationId,
        history: parsed.data.history,
      });
      return {
        status: "ok" as const,
        answer: result.answer,
        referenceDate: result.referenceDate,
        executionMode: result.executionMode,
        conversation: result.conversation,
        grounding: {
          causal: result.grounding.causal.passed,
          quality: result.grounding.quality.passed,
          provenance: result.grounding.provenance.passed,
          evidence: result.grounding.evidence.passed,
        },
        meta: {
          toolCallCount: result.toolCalls.length,
          iterations: result.iterations,
          latencyMs: result.llm.total.latencyMs,
        },
      };
    } catch (error) {
      request.log.error(
        { err: safeErrorForLog(error) },
        "assistant request failed",
      );
      return reply.status(503).send({
        error: "assistant_unavailable",
        message:
          "O assistente financeiro não respondeu neste momento. Os endpoints determinísticos continuam disponíveis.",
      });
    }
  });
}
