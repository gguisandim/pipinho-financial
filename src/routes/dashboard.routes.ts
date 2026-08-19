import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { registerApiAuthHook, type ApiAuthOptions } from "../http/api-auth.js";
import { safeErrorForLog } from "../http/safe-error.js";
import { dateRangeShape, validateDateRange } from "../http/validation.js";
import { createPluggyTransactionRepository } from "../integrations/pluggy/pluggy.factory.js";
import { GroqStructuredProvider } from "../llm/providers/groq-structured.provider.js";
import { DashboardDataService } from "../services/dashboard-data.service.js";
import { DashboardInsightService } from "../services/dashboard-insight.service.js";
import { RealFinancialDataService } from "../services/real-financial-data.service.js";

const emptyQuerySchema = z.object({}).strict();

const rangeSchema = z
  .object(dateRangeShape)
  .strict()
  .superRefine(validateDateRange);

const overviewQuerySchema = z
  .object({
    ...dateRangeShape,
    months: z.coerce.number().int().min(1).max(24).optional(),
  })
  .strict()
  .superRefine(validateDateRange);

const institutionQuerySchema = z
  .object({
    ...dateRangeShape,
    institution: z.string().trim().min(1).max(80).optional(),
  })
  .strict()
  .superRefine(validateDateRange);

const largestQuerySchema = z
  .object({
    ...dateRangeShape,
    limit: z.coerce.number().int().min(1).max(10).optional(),
  })
  .strict()
  .superRefine(validateDateRange);

const aiBodySchema = z
  .object({
    ...dateRangeShape,
    months: z.coerce.number().int().min(1).max(24).optional(),
    maxCards: z.coerce.number().int().min(1).max(6).optional(),
  })
  .strict()
  .superRefine(validateDateRange);

export interface DashboardRouteOptions extends ApiAuthOptions {
  dataService?: DashboardDataService;
  insightService?: DashboardInsightService;
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

function invalidRequest(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  details: unknown,
) {
  return reply.status(400).send({
    error: "invalid_request",
    details,
  });
}

function logRouteError(
  request: { log: { error: (obj: unknown, msg?: string) => void } },
  error: unknown,
  message: string,
): void {
  request.log.error({ err: safeErrorForLog(error) }, message);
}

export async function dashboardRoutes(
  app: FastifyInstance,
  options: DashboardRouteOptions = {},
) {
  const data = () => options.dataService ?? defaultDataService();
  const insights = () => options.insightService ?? defaultInsightService();

  registerApiAuthHook(app, options);

  app.get("/api/v1/dashboard/overview", async (request, reply) => {
    const parsed = overviewQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return invalidRequest(reply, parsed.error.flatten());

    try {
      return await data().getOverview(parsed.data);
    } catch (error) {
      logRouteError(request, error, "dashboard overview failed");
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
      logRouteError(request, error, "dashboard monthly series failed");
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
      logRouteError(request, error, "dashboard categories failed");
      return reply.status(503).send({ error: "dashboard_data_unavailable" });
    }
  });

  app.get("/api/v1/dashboard/spending/institutions", async (request, reply) => {
    const parsed = institutionQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return invalidRequest(reply, parsed.error.flatten());

    try {
      return await data().getInstitutions(parsed.data);
    } catch (error) {
      logRouteError(request, error, "dashboard institutions failed");
      return reply.status(503).send({ error: "dashboard_data_unavailable" });
    }
  });

  app.get("/api/v1/dashboard/expenses/largest", async (request, reply) => {
    const parsed = largestQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return invalidRequest(reply, parsed.error.flatten());

    try {
      return await data().getLargestExpenses(parsed.data);
    } catch (error) {
      logRouteError(request, error, "dashboard largest expenses failed");
      return reply.status(503).send({ error: "dashboard_data_unavailable" });
    }
  });

  app.get("/api/v1/dashboard/quality", async (request, reply) => {
    const parsed = rangeSchema.safeParse(request.query ?? {});
    if (!parsed.success) return invalidRequest(reply, parsed.error.flatten());

    try {
      return await data().getQuality(parsed.data);
    } catch (error) {
      logRouteError(request, error, "dashboard quality failed");
      return reply.status(503).send({ error: "dashboard_data_unavailable" });
    }
  });

  app.get("/api/v1/dashboard/capabilities", async (request, reply) => {
    const parsed = emptyQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return invalidRequest(reply, parsed.error.flatten());

    try {
      return await data().getCapabilities();
    } catch (error) {
      logRouteError(request, error, "dashboard capabilities failed");
      return reply.status(503).send({ error: "dashboard_data_unavailable" });
    }
  });

  app.post("/api/v1/dashboard/ai/insights", async (request, reply) => {
    const parsed = aiBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) return invalidRequest(reply, parsed.error.flatten());

    try {
      return await insights().generate(parsed.data);
    } catch (error) {
      logRouteError(request, error, "dashboard AI insights failed");
      return reply.status(503).send({
        error: "dashboard_ai_unavailable",
        message:
          "Os dados determinísticos continuam disponíveis, mas a camada de IA não respondeu.",
      });
    }
  });
}
