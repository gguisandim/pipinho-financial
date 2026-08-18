import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import type { Transaction } from "../src/domain/finance.js";
import type { StructuredLlmProvider, StructuredLlmRequest } from "../src/llm/providers/structured-llm-provider.js";
import type { TransactionRepository } from "../src/repositories/transaction.repository.js";
import { dashboardRoutes } from "../src/routes/dashboard.routes.js";
import { DashboardDataService } from "../src/services/dashboard-data.service.js";
import { DashboardInsightService } from "../src/services/dashboard-insight.service.js";
import { RealFinancialDataService } from "../src/services/real-financial-data.service.js";

const transactions: Transaction[] = [
  {
    id: "income",
    date: "2026-08-01",
    description: "Salário",
    amount: 1000,
    type: "credit",
    category: "income",
    metadata: {
      source: "pluggy",
      institution: "Nubank",
      role: "bank_inflow",
      status: "posted",
      categorySource: "pluggy",
    },
  },
  {
    id: "expense",
    date: "2026-08-02",
    description: "Mercado",
    amount: 100,
    type: "debit",
    category: "groceries",
    metadata: {
      source: "pluggy",
      institution: "Nubank",
      role: "card_purchase",
      status: "posted",
    },
  },
];

function services() {
  const repository: TransactionRepository = {
    source: "pluggy",
    async listTransactions() {
      return {
        source: "pluggy",
        fetchedAt: "2026-08-18T05:00:00.000Z",
        transactions,
        diagnostics: {
          source: "pluggy",
          rawTransactions: 2,
          mappedTransactions: 2,
          skippedPending: 0,
          skippedInvalid: 0,
          truncatedAccounts: 0,
        },
      };
    },
  };
  const data = new DashboardDataService(new RealFinancialDataService(repository));
  const llm: StructuredLlmProvider = {
    async completeStructured<T>(request: StructuredLlmRequest<T>) {
      return {
        data: request.schema.parse({
          headline: "Resumo do período disponível",
          cards: [
            {
              priority: "medium",
              kind: "context",
              title: "Gastos observados",
              message: "O dashboard possui gastos observados no período selecionado.",
              suggestedAction: "Compare categorias e instituições antes de aprofundar a análise.",
              uiAction: "open_spending_categories",
              metricRefs: ["spending.netSpending"],
              confidence: "high",
            },
          ],
        }),
        rawText: "{}",
        provider: "fake",
        model: "fake",
        latencyMs: 1,
        usage: { totalTokens: 1 },
      };
    },
  };
  return { data, insight: new DashboardInsightService(data, llm) };
}

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
});

async function app() {
  const instance = Fastify({ logger: false });
  const { data, insight } = services();
  await instance.register(dashboardRoutes, {
    dataService: data,
    insightService: insight,
    requireAuth: false,
  });
  await instance.ready();
  apps.push(instance);
  return instance;
}

describe("dashboardRoutes", () => {
  it("retorna overview pronto para frontend", async () => {
    const server = await app();
    const response = await server.inject({
      method: "GET",
      url: "/api/v1/dashboard/overview?months=12",
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.metrics.spending.netSpending).toBe(100);
    expect(body.privacy.rawTransactionsIncluded).toBe(false);
  });

  it("rejeita datas fora do contrato HTTP", async () => {
    const server = await app();
    const response = await server.inject({
      method: "GET",
      url: "/api/v1/dashboard/overview?startDate=18-08-2026",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_request");
  });

  it("retorna insight estruturado com evidência resolvida pelo backend", async () => {
    const server = await app();
    const response = await server.inject({
      method: "POST",
      url: "/api/v1/dashboard/ai/insights",
      payload: { maxCards: 2 },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.cards[0].evidence[0]).toEqual({
      ref: "spending.netSpending",
      value: 100,
      unit: "BRL",
    });
  });
});


it("protege dados reais quando autenticação do dashboard está habilitada", async () => {
  const instance = Fastify({ logger: false });
  const { data, insight } = services();
  await instance.register(dashboardRoutes, {
    dataService: data,
    insightService: insight,
    requireAuth: true,
    authToken: "test-secret-token",
  });
  await instance.ready();
  apps.push(instance);

  const unauthorized = await instance.inject({
    method: "GET",
    url: "/api/v1/dashboard/overview",
  });
  expect(unauthorized.statusCode).toBe(401);

  const authorized = await instance.inject({
    method: "GET",
    url: "/api/v1/dashboard/overview",
    headers: { authorization: "Bearer test-secret-token" },
  });
  expect(authorized.statusCode).toBe(200);
});
