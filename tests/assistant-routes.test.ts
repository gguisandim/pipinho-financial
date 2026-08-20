import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { assistantRoutes } from "../src/routes/assistant.routes.js";

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
});

function fakeAgent() {
  return {
    async answer(question: string) {
      return {
        question,
        referenceDate: "2026-08-19",
        executionMode: "fast_path" as const,
        answer: "Você gastou R$ 100,00 no período solicitado.",
        conversation: { id: null, historyMessagesUsed: 0, contextualRouting: false },
        termination: "model_answer" as const,
        iterations: 2,
        toolCalls: [
          {
            iteration: 1,
            id: "test",
            name: "get_spending_summary",
            arguments: {},
            outcome: "executed" as const,
            result: { status: "ok" },
          },
        ],
        turns: [],
        grounding: {
          causal: { passed: true, repaired: false, violations: [] },
          quality: { passed: true, repaired: false, violations: [] },
          provenance: { passed: true, repaired: false, violations: [] },
          evidence: { passed: true, repaired: false, violations: [] },
        },
        llm: {
          agentModel: "fake",
          fallback: null,
          groundingRepair: null,
          qualityRepair: null,
          provenanceRepair: null,
          evidenceRepair: null,
          total: { latencyMs: 1, usage: {} },
        },
      };
    },
  };
}

describe("assistantRoutes", () => {
  it("expõe somente resposta compacta do Real Agent", async () => {
    const app = Fastify({ logger: false });
    await app.register(assistantRoutes, {
      requireAuth: false,
      agentService: fakeAgent() as never,
    });
    await app.ready();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/assistant",
      payload: { question: "Quanto gastei em julho?" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.answer).toContain("R$ 100,00");
    expect(body.grounding.evidence).toBe(true);
    expect(body.meta.toolCallCount).toBe(1);
    expect(body.toolCalls).toBeUndefined();
    expect(body.turns).toBeUndefined();
  });

  it("protege a rota com o mesmo Bearer token da API", async () => {
    const app = Fastify({ logger: false });
    await app.register(assistantRoutes, {
      requireAuth: true,
      authToken: "test-token",
      agentService: fakeAgent() as never,
    });
    await app.ready();
    apps.push(app);

    const unauthorized = await app.inject({
      method: "POST",
      url: "/api/v1/assistant",
      payload: { question: "Analise meus gastos" },
    });
    expect(unauthorized.statusCode).toBe(401);

    const authorized = await app.inject({
      method: "POST",
      url: "/api/v1/assistant",
      headers: { authorization: "Bearer test-token" },
      payload: { question: "Analise meus gastos" },
    });
    expect(authorized.statusCode).toBe(200);
  });

  it("rejeita payload com campos desconhecidos", async () => {
    const app = Fastify({ logger: false });
    await app.register(assistantRoutes, {
      requireAuth: false,
      agentService: fakeAgent() as never,
    });
    await app.ready();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/assistant",
      payload: { question: "Analise meus gastos", debug: true },
    });
    expect(response.statusCode).toBe(400);
  });
});


describe("assistantRoutes - Cycle 11 conversation context", () => {
  it("aceita conversationId e histórico curto", async () => {
    const app = Fastify({ logger: false });
    const received: unknown[] = [];
    const agent = {
      async answer(question: string, context?: unknown) {
        received.push({ question, context });
        return {
          ...(await fakeAgent().answer(question)),
          conversation: { id: "conv-test-123", historyMessagesUsed: 2, contextualRouting: true },
        };
      },
    };
    await app.register(assistantRoutes, {
      requireAuth: false,
      agentService: agent as never,
    });
    await app.ready();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/assistant",
      payload: {
        question: "E mês passado?",
        conversationId: "conv-test-123",
        history: [
          { role: "user", content: "Quanto gastei este mês?" },
          { role: "assistant", content: "Você gastou R$ 100,00." },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(received).toHaveLength(1);
    expect(response.json().conversation.contextualRouting).toBe(true);
  });
});
