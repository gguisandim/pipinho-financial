import { describe, expect, it } from "vitest";
import { mapPluggyTransaction } from "../src/integrations/pluggy/mappers/pluggy-transaction.mapper.js";
import type {
  PluggyAccount,
  PluggyTransaction,
} from "../src/integrations/pluggy/pluggy-data.schemas.js";

function account(type: "BANK" | "CREDIT"): PluggyAccount {
  return {
    id: `account-${type.toLowerCase()}`,
    itemId: "item-1",
    type,
    subtype: type === "BANK" ? "CHECKING_ACCOUNT" : "CREDIT_CARD",
    balance: 0,
    currencyCode: "BRL",
    name: type === "BANK" ? "Conta" : "Cartão",
  };
}

function transaction(overrides: Partial<PluggyTransaction> = {}): PluggyTransaction {
  return {
    id: "tx-1",
    accountId: "account-bank",
    description: "Transação",
    currencyCode: "BRL",
    amount: 100,
    date: "2026-08-16T03:00:00.000Z",
    status: "POSTED",
    type: "DEBIT",
    ...overrides,
  };
}

const contextBase = {
  institution: "Nubank",
  itemId: "item-1",
  timeZone: "America/Sao_Paulo",
};

describe("mapPluggyTransaction", () => {
  it("mapeia saída BANK para debit e preserva metadados", () => {
    const result = mapPluggyTransaction(
      transaction({ description: "PIX enviado", amount: -125.5, type: "DEBIT" }),
      { ...contextBase, account: account("BANK") },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.transaction).toMatchObject({
      amount: 125.5,
      type: "debit",
      category: "other",
    });
    expect(result.transaction.metadata).toMatchObject({
      source: "pluggy",
      institution: "Nubank",
      accountType: "BANK",
      role: "bank_outflow",
      originalAmount: -125.5,
    });
  });

  it("mapeia compra CREDIT card como despesa sem usar sinal como direção", () => {
    const result = mapPluggyTransaction(
      transaction({ accountId: "account-credit", amount: 79.9, type: "DEBIT", description: "IFOOD" }),
      { ...contextBase, account: account("CREDIT") },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.transaction.type).toBe("debit");
    expect(result.transaction.amount).toBe(79.9);
    expect(result.transaction.category).toBe("food_delivery");
    expect(result.transaction.metadata?.role).toBe("card_purchase");
  });

  it("mapeia pagamento/crédito de cartão sem transformá-lo em renda econômica", () => {
    const result = mapPluggyTransaction(
      transaction({ accountId: "account-credit", amount: -500, type: "CREDIT", description: "Pagamento de fatura" }),
      { ...contextBase, account: account("CREDIT") },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.transaction.type).toBe("credit");
    expect(result.transaction.amount).toBe(500);
    expect(result.transaction.metadata?.role).toBe("card_credit");
  });

  it("prioriza categoria Pluggy quando disponível", () => {
    const result = mapPluggyTransaction(
      transaction({ category: "Housing - Rent", description: "PGTO" }),
      { ...contextBase, account: account("BANK") },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.transaction.category).toBe("housing");
    expect(result.transaction.metadata?.categorySource).toBe("pluggy");
    expect(result.transaction.metadata?.categoryConfidence).toBe("high");
  });

  it("não classifica Transfer como income só por ser CREDIT", () => {
    const result = mapPluggyTransaction(
      transaction({ type: "CREDIT", category: "Transfer - PIX", description: "PIX recebido" }),
      { ...contextBase, account: account("BANK") },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.transaction.type).toBe("credit");
    expect(result.transaction.category).toBe("other");
    expect(result.transaction.metadata?.role).toBe("bank_inflow");
  });
});
