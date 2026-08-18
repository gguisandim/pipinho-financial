import { describe, expect, it } from "vitest";
import { sanitizeTransactionDescription } from "../src/enrichment/description-sanitizer.js";

describe("description sanitizer", () => {
  it("redige identificadores variáveis e produz fingerprint estável", () => {
    const a = sanitizeTransactionDescription("LOJA ABC 123456 pedido 7788");
    const b = sanitizeTransactionDescription("LOJA ABC 999999 pedido 1122");

    expect(a.sanitized).toContain("loja abc");
    expect(a.sanitized).not.toContain("123456");
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("marca contexto PIX/transferência como não elegível para LLM remoto", () => {
    const result = sanitizeTransactionDescription("PIX transferido para Fulano 123456");
    expect(result.llmEligible).toBe(false);
    expect(result.privacyFlags).toContain("transfer_context");
  });
});
