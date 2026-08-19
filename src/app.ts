import Fastify from "fastify";
import { assistantRoutes, type AssistantRouteOptions } from "./routes/assistant.routes.js";
import { dashboardRoutes, type DashboardRouteOptions } from "./routes/dashboard.routes.js";
import { APP_NAME, APP_VERSION } from "./version.js";

export function buildApp(options: {
  logger?: boolean;
  dashboard?: DashboardRouteOptions;
  assistant?: AssistantRouteOptions;
} = {}) {
  const app = Fastify({ logger: options.logger ?? true });

  app.get("/", async () => ({
    name: APP_NAME,
    version: APP_VERSION,
    status: "running",
    architecture: "deterministic-financial-engine + guarded-real-agent",
    endpoints: {
      health: "GET /health",
      dashboardOverview: "GET /api/v1/dashboard/overview",
      dashboardMonthly: "GET /api/v1/dashboard/series/monthly",
      dashboardCategories: "GET /api/v1/dashboard/spending/categories",
      dashboardInstitutions: "GET /api/v1/dashboard/spending/institutions",
      dashboardQuality: "GET /api/v1/dashboard/quality",
      dashboardLargestExpenses: "GET /api/v1/dashboard/expenses/largest",
      dashboardCapabilities: "GET /api/v1/dashboard/capabilities",
      dashboardAiInsights: "POST /api/v1/dashboard/ai/insights",
      assistant: "POST /api/v1/assistant",
    },
  }));

  app.get("/health", async () => ({
    status: "ok",
    version: APP_VERSION,
  }));

  void app.register(dashboardRoutes, options.dashboard ?? {});
  void app.register(assistantRoutes, options.assistant ?? {});

  return app;
}
