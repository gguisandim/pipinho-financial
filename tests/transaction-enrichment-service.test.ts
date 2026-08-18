import { describe, expect, it } from "vitest";
import type { Transaction } from "../src/domain/finance.js";
import type {
  StructuredLlmProvider,
  StructuredLlmRequest,
} from "../src/llm/providers/structured-llm-provider.js";
import type { TransactionRepository } from "../src/repositories/transaction.repository.js";
import { TransactionEnrichmentService } from "../src/services/transaction-enrichment.service.js";

const transactions: Transaction[] = [
  {
    id: "1",
    date: "2026-08-01",
    description: "LOJA XPTO 123456",
    amount: 100,
    type: "debit",
    category: "other",
    metadata: {
      source: "pluggy",
      role: "card_purchase",
      status: "posted",
      institution: "Nubank",
      accountId: "sensitive-account-id",
      itemId: "sensitive-item-id",
    },
  },
  {
    id: "2",
    date: "2026-08-02",
    description: "LOJA XPTO 999999",
    amount: 80,
    type: "debit",
    category: "other",
    metadata: {
      source: "pluggy",
      role: "card_purchase",
      status: "posted",
      institution: "Nubank",
      accountId: "sensitive-account-id",
      itemId: "sensitive-item-id",
    },
  },
  {
    id: "3",
    date: "2026-08-03",
    description: "PIX RECEBIDO MARIA",
    amount: 500,
    type: "credit",
    category: "other",
    metadata: {
      source: "pluggy",
      role: "bank_inflow",
      status: "posted",
      institution: "PicPay",
    },
  },
];

function repository(): TransactionRepository {
  return {
    source: "pluggy",
    async listTransactions() {
      return {
        source: "pluggy",
        fetchedAt: "2026-08-18T00:00:00.000Z",
        transactions,
        diagnostics: {
          source: "pluggy",
          items: 3,
          accounts: 6,
          rawTransactions: transactions.length,
          mappedTransactions: transactions.length,
          skippedPending: 0,
          skippedInvalid: 0,
          truncatedAccounts: 0,
        },
      };
    },
  };
}

describe("TransactionEnrichmentService", () => {
  it("envia somente candidatos de despesa sanitizados ao classificador", async () => {
    let captured: StructuredLlmRequest<unknown> | null = null;
    const provider: StructuredLlmProvider = {
      async completeStructured<T>(request: StructuredLlmRequest<T>) {
        captured = request as StructuredLlmRequest<unknown>;
        const parsedUser = request.user;
        const candidateId = /"candidateId":\s*"([^"]+)"/.exec(parsedUser)?.[1];
        return {
          data: request.schema.parse({
            suggestions: [
              {
                candidateId,
                category: "shopping",
                confidence: "medium",
                reason: "Descrição compatível com varejo geral.",
              },
            ],
          }),
          rawText: "{}",
          provider: "fake",
          model: "fake-model",
          latencyMs: 1,
          usage: { totalTokens: 10 },
        };
      },
    };

    const service = new TransactionEnrichmentService(repository(), provider);
    const scan = await service.scan({ minOccurrences: 2, maxExpenseGroups: 5 });
    const result = await service.classifyExpenses(scan);

    expect(result?.suggestions).toHaveLength(1);
    expect(captured).not.toBeNull();
    const payload = captured!.user;
    expect(payload).not.toContain("100");
    expect(payload).not.toContain("80");
    expect(payload).not.toContain("sensitive-account-id");
    expect(payload).not.toContain("sensitive-item-id");
    expect(payload).not.toContain("PIX RECEBIDO MARIA");
  });
});
