import { describe, expect, it } from "vitest";
import {
  buildContextualRoutingQuestion,
  isLikelyConversationalFollowUp,
  sanitizeConversationHistory,
} from "../src/agent/conversation-context.js";
import { routeFinancialTools } from "../src/agent/financial-tool-router.js";

describe("conversation context", () => {
  it("detecta follow-up curto", () => {
    expect(isLikelyConversationalFollowUp("E mês passado?")).toBe(true);
    expect(isLikelyConversationalFollowUp("E no Nubank?")).toBe(true);
  });

  it("não mistura contexto em pergunta autônoma", () => {
    const result = buildContextualRoutingQuestion("Qual foi meu último gasto?", [
      { role: "user", content: "Quanto gastei em julho?" },
      { role: "assistant", content: "Você gastou..." },
    ]);
    expect(result).toBe("Qual foi meu último gasto?");
  });

  it("herda a intenção da pergunta anterior para roteamento", () => {
    const result = buildContextualRoutingQuestion("E mês passado?", [
      { role: "user", content: "Quanto eu gastei este mês?" },
      { role: "assistant", content: "Você gastou..." },
    ]);
    expect(result).toContain("E mês passado?");
    expect(result).toContain("Quanto eu gastei este mês?");
    expect(routeFinancialTools(result).intent).toBe("spending");
  });

  it("limita e higieniza o histórico", () => {
    const history = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: ` mensagem   ${index} `,
    }));
    const safe = sanitizeConversationHistory(history, 4);
    expect(safe).toHaveLength(4);
    expect(safe[0]?.content).toBe("mensagem 8");
  });
});
