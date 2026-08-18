import { describe, expect, it } from "vitest";
import { buildEnrichmentCandidates } from "../src/enrichment/enrichment-candidates.js";
import type { Transaction } from "../src/domain/finance.js";

function tx(options: Partial<Transaction> & Pick<Transaction, "id" | "description">): Transaction {
  return {
    id: options.id,
    date: options.date ?? "2026-08-01",
    description: options.description,
    amount: options.amount ?? 10,
    type: options.type ?? "debit",
    category: options.category ?? "other",
    metadata: options.metadata ?? {
      source: "pluggy",
      role: "card_purchase",
      status: "posted",
      institution: "Nubank",
    },
  };
}

describe("enrichment candidates", () => {
  it("agrupa despesas other repetidas por descrição sanitizada", () => {
    const result = buildEnrichmentCandidates([
      tx({ id: "1", description: "LOJA TESTE 123456" }),
      tx({ id: "2", description: "LOJA TESTE 999999" }),
      tx({ id: "3", description: "Spotify", category: "subscriptions" }),
    ]);

    expect(result.expenseCandidates).toHaveLength(1);
    expect(result.expenseCandidates[0]?.occurrenceCount).toBe(2);
  });

  it("separa entradas bancárias não classificadas para revisão humana", () => {
    const result = buildEnrichmentCandidates([
      tx({
        id: "in-1",
        description: "PIX RECEBIDO JOAO",
        type: "credit",
        category: "other",
        metadata: {
          source: "pluggy",
          role: "bank_inflow",
          status: "posted",
          institution: "PicPay",
        },
      }),
    ]);

    expect(result.inflowCandidates).toHaveLength(1);
    expect(result.inflowCandidates[0]?.kind).toBe("bank_inflow");
    expect(result.inflowCandidates[0]?.llmEligible).toBe(false);
  });
});
