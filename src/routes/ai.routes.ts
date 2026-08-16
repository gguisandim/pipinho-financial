import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { z } from "zod";
import { GroqProvider } from "../llm/providers/groq.provider.js";
import { GroqStructuredProvider } from "../llm/providers/groq-structured.provider.js";
import { GroqToolCallingProvider } from "../llm/tool-calling/groq-tool-calling.provider.js";
import { FinancialInsightService } from "../services/financial-insight.service.js";
import { StructuredFinancialInsightService } from "../services/structured-financial-insight.service.js";
import { ToolCallingFinancialService } from "../services/tool-calling-financial.service.js";
import { AgenticFinancialService } from "../services/agentic-financial.service.js";

const requestSchema = z.object({
  question: z
    .string()
    .min(3)
    .max(500)
    .default("O que mais chama atenção neste resumo financeiro?"),
});

export async function aiRoutes(app: FastifyInstance) {
  app.post("/api/v1/ai/explain-summary", async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_request",
        details: parsed.error.flatten(),
      });
    }

    try {
      const service = new FinancialInsightService(new GroqProvider());
      return await service.explain(parsed.data.question);
    } catch (error) {
      request.log.error(error);
      const message = error instanceof Error ? error.message : "Erro desconhecido";

      return reply.status(500).send({
        error: "llm_request_failed",
        message,
      });
    }
  });

  app.post("/api/v1/ai/structured-analysis", async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_request",
        details: parsed.error.flatten(),
      });
    }

    try {
      const service = new StructuredFinancialInsightService(
        new GroqStructuredProvider(),
      );
      return await service.analyze(parsed.data.question);
    } catch (error) {
      request.log.error(error);
      const message = error instanceof Error ? error.message : "Erro desconhecido";

      return reply.status(500).send({
        error: "structured_llm_request_failed",
        message,
      });
    }
  });

  app.post("/api/v1/ai/tool-analysis", async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_request",
        details: parsed.error.flatten(),
      });
    }

    try {
      const service = new ToolCallingFinancialService(
        new GroqToolCallingProvider(),
        new GroqProvider(env.GROQ_FINAL_MODEL),
      );
      return await service.answer(parsed.data.question);
    } catch (error) {
      request.log.error(error);
      const message = error instanceof Error ? error.message : "Erro desconhecido";

      return reply.status(500).send({
        error: "tool_calling_failed",
        message,
      });
    }
  });

  app.post("/api/v1/ai/agent-analysis", async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_request",
        details: parsed.error.flatten(),
      });
    }

    try {
      const service = new AgenticFinancialService(
        new GroqToolCallingProvider(env.GROQ_AGENT_MODEL),
        new GroqProvider(env.GROQ_FINAL_MODEL),
      );
      return await service.answer(parsed.data.question);
    } catch (error) {
      request.log.error(error);
      const message = error instanceof Error ? error.message : "Erro desconhecido";

      return reply.status(500).send({
        error: "agent_loop_failed",
        message,
      });
    }
  });

}
