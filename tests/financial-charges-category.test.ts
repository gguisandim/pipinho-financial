import { describe, expect, it } from "vitest";
import type { PluggyAccount, PluggyTransaction } from "../src/integrations/pluggy/pluggy-data.schemas.js";
import { mapPluggyTransaction } from "../src/integrations/pluggy/mappers/pluggy-transaction.mapper.js";

const account: PluggyAccount = {
  id: "account-card",
  itemId: "item-1",
  type: "CREDIT",
  subtype: "CREDIT_CARD",
  number: "1234",
  balance: 0,
  currencyCode: "BRL",
  name: "Cartão",
};

function tx(description: string): PluggyTransaction {
  return {
    id: description.replace(/\s+/g, "-"),
    accountId: account.id,
    description,
    currencyCode: "BRL",
    amount: 10,
    date: "2026-08-01T12:00:00.000Z",
    status: "POSTED",
    type: "DEBIT",
  };
}

describe("financial_charges taxonomy", () => {
  for (const description of [
    "Juros crédito rotativo",
    "IOF diário rotativo",
    "Multa por atraso",
    "Juros de mora",
  ]) {
    it(`classifica ${description}`, () => {
      const result = mapPluggyTransaction(tx(description), {
        account,
        institution: "Nubank",
        itemId: "item-1",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.transaction.category).toBe("financial_charges");
      expect(result.transaction.metadata?.categorySource).toBe("description_rule");
    });
  }
});
