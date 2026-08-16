import type { FastifyInstance } from "fastify";
import { syntheticTransactions } from "../fixtures/synthetic-transactions.js";
import { summarizeTransactions } from "../financial-engine/summarize.js";

export async function financeRoutes(app: FastifyInstance) {
  app.get("/api/v1/finance/summary", async () => {
    return summarizeTransactions(syntheticTransactions);
  });
}
