import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { createPluggyTransactionRepository } from "../integrations/pluggy/pluggy.factory.js";
import { GroqStructuredProvider } from "../llm/providers/groq-structured.provider.js";
import { DashboardDataService } from "../services/dashboard-data.service.js";
import { DashboardInsightService } from "../services/dashboard-insight.service.js";
import { RealFinancialDataService } from "../services/real-financial-data.service.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const rangeSchema = z.object({
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
});

const overviewQuerySchema = rangeSchema.extend({
  months: z.coerce.number().int().min(1).max(24).optional(),
});

const institutionQuerySchema = rangeSchema.extend({
  institution: z.string().min(1).max(80).optional(),
});

const largestQuerySchema = rangeSchema.extend({
  limit: z.coerce.number().int().min(1).max(10).optional(),
});

const aiBodySchema = rangeSchema.extend({
  months: z.coerce.number().int().min(1).max(24).optional(),
  maxCards: z.coerce.number().int().min(1).max(6).optional(),
});

export interface DashboardRouteOptions {
  dataService?: DashboardDataService;
  insightService?: DashboardInsightService;
  requireAuth?: boolean;
  authToken?: string | null;
}

let realDataService: DashboardDataService | null = null;
let realInsightService: DashboardInsightService | null = null;

function defaultDataService(): DashboardDataService {
  if (!realDataService) {
    const repository = createPluggyTransactionRepository();
    const finance = new RealFinancialDataService(repository, {
      snapshotTtlMs: env.DASHBOARD_CACHE_TTL_MS,
    });
    realDataService = new DashboardDataService(finance);
  }
  return realDataService;
}

function defaultInsightService(): DashboardInsightService {
  if (!realInsightService) {
    realInsightService = new DashboardInsightService(
      defaultDataService(),
      new GroqStructuredProvider(),
    );
  }
  return realInsightService;
}

function invalidRequest(reply: { status: (code: number) => { send: (body: unknown) => unknown } }, details: unknown) {
  return reply.status(400).send({
    error: "invalid_request",
    details,
  });
}

function safeTokenEquals(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function dashboardRoutes(
  app: FastifyInstance,
  options: DashboardRouteOptions = {},
) {
  const data = () => options.dataService ?? defaultDataService();
  const insights = () => options.insightService ?? defaultInsightService();
  const requireAuth = options.requireAuth ?? env.DASHBOARD_REQUIRE_AUTH === "true";
  const authToken = options.authToken === undefined ? env.DASHBOARD_API_TOKEN : options.authToken;

  app.addHook("onRequest", async (request, reply) => {
    if (!requireAuth) return;
    if (!authToken) {
      return reply.status(503).send({
        error: "dashboard_auth_not_configured",
        message: "A API do dashboard está protegida, mas DASHBOARD_API_TOKEN não foi configurado.",
      });
    }

    const header = request.headers.authorization;
    const prefix = "Bearer ";
    const received = typeof header === "string" && header.startsWith(prefix)
      ? header.slice(prefix.length)
      : "";

    if (!received || !safeTokenEquals(received, authToken)) {
      return reply.status(401).send({
        error: "unauthorized",
        message: "Bearer token ausente ou inválido.",
      });
    }
  });

  app.get("/api/v1/dashboard/overview", async (request, reply) => {
    const parsed = overviewQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return invalidRequest(reply, parsed.error.flatten());

    try {
      return await data().getOverview(parsed.data);
    } catch (error) {
      request.log.error(error);
      return reply.status(503).send({
        error: "dashboard_data_unavailable",
        message: "Não foi possível atualizar os dados do dashboard neste momento.",
      });
    }
  });

  app.get("/api/v1/dashboard/series/monthly", async (request, reply) => {
    const parsed = overviewQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return invalidRequest(reply, parsed.error.flatten());

    try {
      return await data().getMonthly(parsed.data);
    } catch (error) {
      request.log.error(error);
      return reply.status(503).send({
        error: "dashboard_data_unavailable",
        message: "Não foi possível carregar a série mensal.",
      });
    }
  });

  app.get("/api/v1/dashboard/spending/categories", async (request, reply) => {
    const parsed = rangeSchema.safeParse(request.query ?? {});
    if (!parsed.success) return invalidRequest(reply, parsed.error.flatten());

    try {
      return await data().getCategories(parsed.data);
    } catch (error) {
      request.log.error(error);
      return reply.status(503).send({ error: "dashboard_data_unavailable" });
    }
  });

  app.get("/api/v1/dashboard/spending/institutions", async (request, reply) => {
    const parsed = institutionQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return invalidRequest(reply, parsed.error.flatten());

    try {
      return await data().getInstitutions(parsed.data);
    } catch (error) {
      request.log.error(error);
      return reply.status(503).send({ error: "dashboard_data_unavailable" });
    }
  });

  app.get("/api/v1/dashboard/expenses/largest", async (request, reply) => {
    const parsed = largestQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return invalidRequest(reply, parsed.error.flatten());

    try {
      return await data().getLargestExpenses(parsed.data);
    } catch (error) {
      request.log.error(error);
      return reply.status(503).send({ error: "dashboard_data_unavailable" });
    }
  });

  app.get("/api/v1/dashboard/quality", async (request, reply) => {
    const parsed = rangeSchema.safeParse(request.query ?? {});
    if (!parsed.success) return invalidRequest(reply, parsed.error.flatten());

    try {
      return await data().getQuality(parsed.data);
    } catch (error) {
      request.log.error(error);
      return reply.status(503).send({ error: "dashboard_data_unavailable" });
    }
  });

  app.get("/api/v1/dashboard/capabilities", async (request, reply) => {
    try {
      return await data().getCapabilities();
    } catch (error) {
      request.log.error(error);
      return reply.status(503).send({ error: "dashboard_data_unavailable" });
    }
  });

  app.post("/api/v1/dashboard/ai/insights", async (request, reply) => {
    const parsed = aiBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) return invalidRequest(reply, parsed.error.flatten());

    try {
      return await insights().generate(parsed.data);
    } catch (error) {
      request.log.error(error);
      return reply.status(503).send({
        error: "dashboard_ai_unavailable",
        message: "Os dados determinísticos continuam disponíveis, mas a camada de IA não respondeu.",
      });
    }
  });
}
