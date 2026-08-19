import { describe, expect, it } from "vitest";
import type { Transaction } from "../src/domain/finance.js";
import type { StructuredLlmProvider, StructuredLlmRequest } from "../src/llm/providers/structured-llm-provider.js";
import type { TransactionRepository } from "../src/repositories/transaction.repository.js";
import { DashboardDataService } from "../src/services/dashboard-data.service.js";
import { DashboardInsightService } from "../src/services/dashboard-insight.service.js";
import { RealFinancialDataService } from "../src/services/real-financial-data.service.js";

const transactions: Transaction[] = [
  {
    id: "out",
    date: "2026-08-01",
    description: "DESCRICAO SENSIVEL NAO DEVE IR AO LLM",
    amount: 500,
    type: "debit",
    category: "other",
    metadata: {
      source: "pluggy",
      institution: "Nubank",
      role: "bank_outflow",
      status: "posted",
    },
  },
  {
    id: "in",
    date: "2026-08-02",
    description: "PIX PESSOA PRIVADA",
    amount: 100,
    type: "credit",
    category: "other",
    metadata: {
      source: "pluggy",
      institution: "Nubank",
      role: "bank_inflow",
      status: "posted",
    },
  },
];

const repository: TransactionRepository = {
  source: "pluggy",
  async listTransactions() {
    return {
      source: "pluggy",
      fetchedAt: "2026-08-18T05:00:00.000Z",
      transactions,
      diagnostics: {
        source: "pluggy",
        rawTransactions: transactions.length,
        mappedTransactions: transactions.length,
        skippedPending: 0,
        skippedInvalid: 0,
        truncatedAccounts: 0,
      },
    };
  },
};

describe("DashboardInsightService", () => {
  it("envia somente agregados e resolve evidências no backend", async () => {
    let capturedPrompt = "";
    const provider: StructuredLlmProvider = {
      async completeStructured<T>(request: StructuredLlmRequest<T>) {
        capturedPrompt = request.user;
        return {
          data: request.schema.parse({
            headline: "Há pontos de atenção no período",
            cards: [
              {
                priority: "high",
                kind: "warning",
                title: "Fluxo bancário negativo",
                message: "As saídas superaram as entradas observadas no período.",
                suggestedAction: "Revise os principais componentes das saídas bancárias.",
                uiAction: "open_monthly",
                metricRefs: ["liquidity.netBankCashFlow"],
                confidence: "high",
              },
              {
                priority: "low",
                kind: "context",
                title: "Encargos financeiros",
                message: "Há encargos financeiros relevantes no período observado.",
                suggestedAction: "Abra a categoria de encargos para revisar a composição.",
                uiAction: "open_financial_charges",
                metricRefs: ["quality.financialChargesPct"],
                confidence: "low",
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

    const data = new DashboardDataService(new RealFinancialDataService(repository));
    const service = new DashboardInsightService(data, provider);
    const result = await service.generate();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(capturedPrompt).not.toContain("DESCRICAO SENSIVEL");
    expect(capturedPrompt).not.toContain("PIX PESSOA PRIVADA");
    expect(result.cards[0]?.evidence[0]?.ref).toBe("liquidity.netBankCashFlow");
    expect(result.cards).toHaveLength(1);
    expect(result.cards.some((card) => card.uiAction === "open_financial_charges")).toBe(false);
    expect(result.privacy.rawTransactionsSentToLlm).toBe(false);
  });
});
