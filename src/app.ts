import Fastify from "fastify";
import { aiRoutes } from "./routes/ai.routes.js";
import { dashboardRoutes, type DashboardRouteOptions } from "./routes/dashboard.routes.js";
import { financeRoutes } from "./routes/finance.routes.js";

export function buildApp(options: {
  logger?: boolean;
  dashboard?: DashboardRouteOptions;
} = {}) {
  const app = Fastify({ logger: options.logger ?? true });

  app.get("/", async () => ({
    name: "finance-llm-lab",
    version: "0.9.3",
    status: "running",
    architecture: "deterministic-financial-engine + guarded-llm-agent",
    endpoints: {
      health: "GET /health",
      legacySyntheticSummary: "GET /api/v1/finance/summary",
      dashboardOverview: "GET /api/v1/dashboard/overview",
      dashboardMonthly: "GET /api/v1/dashboard/series/monthly",
      dashboardCategories: "GET /api/v1/dashboard/spending/categories",
      dashboardInstitutions: "GET /api/v1/dashboard/spending/institutions",
      dashboardQuality: "GET /api/v1/dashboard/quality",
      dashboardLargestExpenses: "GET /api/v1/dashboard/expenses/largest",
      dashboardCapabilities: "GET /api/v1/dashboard/capabilities",
      dashboardAiInsights: "POST /api/v1/dashboard/ai/insights",
      aiAgentLegacy: "POST /api/v1/ai/agent-analysis",
    },
  }));

  app.get("/health", async () => ({ status: "ok", version: "0.9.3" }));

  void app.register(financeRoutes);
  void app.register(aiRoutes);
  void app.register(dashboardRoutes, options.dashboard ?? {});

  return app;
}
