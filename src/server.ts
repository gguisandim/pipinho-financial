import Fastify from "fastify";
import { env } from "./config/env.js";
import { aiRoutes } from "./routes/ai.routes.js";
import { financeRoutes } from "./routes/finance.routes.js";

const app = Fastify({ logger: true });

app.get("/", async () => ({
  name: "finance-llm-lab",
  version: "0.3.0",
  status: "running",
  cycles: {
    cycle0: "Financial Engine determinístico",
    cycle1: "LLM com resposta textual",
    cycle2: "Structured Outputs + Zod",
    cycle3: "Local Tool Calling + execução financeira controlada",
  },
  endpoints: {
    health: "GET /health",
    financialSummary: "GET /api/v1/finance/summary",
    aiText: "POST /api/v1/ai/explain-summary",
    aiStructured: "POST /api/v1/ai/structured-analysis",
    aiTools: "POST /api/v1/ai/tool-analysis",
  },
}));

app.get("/health", async () => ({ status: "ok" }));

await app.register(financeRoutes);
await app.register(aiRoutes);

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
