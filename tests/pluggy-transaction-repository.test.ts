import { describe, expect, it } from "vitest";
import { PluggyTransactionRepository } from "../src/repositories/pluggy-transaction.repository.js";
import type { PluggyTransactionDataSource } from "../src/repositories/pluggy-transaction.repository.js";

function fakeDataSource(): PluggyTransactionDataSource {
  return {
    async fetchItem(itemId) {
      return { id: itemId, connectorId: 200, status: "UPDATED" };
    },
    async fetchConnectorForItem() {
      return { name: "MeuPluggy" };
    },
    async fetchAccounts(itemId) {
      return [
        {
          id: "bank-1",
          itemId,
          type: "BANK",
          subtype: "CHECKING_ACCOUNT",
          balance: 100,
          currencyCode: "BRL",
          name: "Conta",
        },
        {
          id: "card-1",
          itemId,
          type: "CREDIT",
          subtype: "CREDIT_CARD",
          balance: 100,
          currencyCode: "BRL",
          name: "Cartão",
        },
      ];
    },
    async fetchAllTransactions(accountId) {
      if (accountId === "bank-1") {
        return {
          accountId,
          pages: 1,
          truncated: false,
          transactions: [
            {
              id: "bank-posted",
              accountId,
              description: "Salário",
              currencyCode: "BRL",
              amount: 1000,
              date: "2026-08-01T12:00:00.000Z",
              status: "POSTED",
              type: "CREDIT",
              category: "Income - Salary",
            },
            {
              id: "bank-pending",
              accountId,
              description: "Pendente",
              currencyCode: "BRL",
              amount: 10,
              date: "2026-08-02T12:00:00.000Z",
              status: "PENDING",
              type: "DEBIT",
            },
          ],
        };
      }

      return {
        accountId,
        pages: 1,
        truncated: false,
        transactions: [
          {
            id: "card-posted",
            accountId,
            description: "Restaurante",
            currencyCode: "BRL",
            amount: 50,
            date: "2026-08-03T12:00:00.000Z",
            status: "POSTED",
            type: "DEBIT",
            category: "Food and drinks - Eating out",
          },
        ],
      };
    },
  };
}

describe("PluggyTransactionRepository", () => {
  it("carrega Items/Accounts, exclui PENDING por padrão e mapeia o domínio", async () => {
    const repository = new PluggyTransactionRepository(fakeDataSource(), {
      itemReferences: [{ itemId: "item-1", label: "Nubank" }],
      timeZone: "America/Sao_Paulo",
      maxPages: 25,
    });

    const snapshot = await repository.listTransactions();

    expect(snapshot.source).toBe("pluggy");
    expect(snapshot.transactions).toHaveLength(2);
    expect(snapshot.accounts).toEqual([
      expect.objectContaining({ institution: "Nubank", name: "Conta", type: "BANK", balance: 100 }),
      expect.objectContaining({ institution: "Nubank", name: "Cartão", type: "CREDIT", balance: 100 }),
    ]);
    expect(snapshot.transactions.map((tx) => tx.id)).toEqual([
      "pluggy:bank-posted",
      "pluggy:card-posted",
    ]);
    expect(snapshot.diagnostics).toMatchObject({
      items: 1,
      accounts: 2,
      rawTransactions: 3,
      mappedTransactions: 2,
      skippedPending: 1,
      skippedInvalid: 0,
    });
  });

  it("pode incluir PENDING explicitamente", async () => {
    const repository = new PluggyTransactionRepository(fakeDataSource(), {
      itemReferences: [{ itemId: "item-1", label: "Nubank" }],
    });

    const snapshot = await repository.listTransactions({ includePending: true });
    expect(snapshot.transactions).toHaveLength(3);
    expect(snapshot.transactions.some((tx) => tx.metadata?.status === "pending")).toBe(true);
  });
});
