import { createGroqRealFinancialAgentService } from "../services/real-financial-agent-groq.factory.js";
import type { ConversationHistoryMessage } from "../agent/conversation-context.js";

interface CaseResult {
  question: string;
  answer: string;
  executionMode: string;
  tools: string[];
  groundingPassed: boolean;
  contextualRouting: boolean;
}

async function run() {
  const agent = createGroqRealFinancialAgentService();
  const history: ConversationHistoryMessage[] = [];
  const results: CaseResult[] = [];

  const conversationQuestions = [
    "Quanto eu gastei este mês?",
    "E mês passado?",
    "E no Nubank?",
  ];

  for (const question of conversationQuestions) {
    const result = await agent.answer(question, {
      conversationId: "cycle11-audit",
      history,
    });
    results.push({
      question,
      answer: result.answer,
      executionMode: result.executionMode,
      tools: result.toolCalls
        .filter((tool) => tool.outcome === "executed")
        .map((tool) => tool.name),
      groundingPassed: Object.values(result.grounding).every((item) => item.passed),
      contextualRouting: result.conversation.contextualRouting,
    });
    history.push({ role: "user", content: question });
    history.push({ role: "assistant", content: result.answer });
  }

  for (const question of [
    "Qual foi meu último gasto?",
    "Quanto eu costumo gastar por dia?",
    "Quanto foi aquele Uber de ontem?",
    "Quanto eu tenho agora?",
    "oi",
  ]) {
    const result = await agent.answer(question, {
      conversationId: "cycle11-audit-standalone",
      history: [],
    });
    results.push({
      question,
      answer: result.answer,
      executionMode: result.executionMode,
      tools: result.toolCalls
        .filter((tool) => tool.outcome === "executed")
        .map((tool) => tool.name),
      groundingPassed: Object.values(result.grounding).every((item) => item.passed),
      contextualRouting: result.conversation.contextualRouting,
    });
  }

  console.table(
    results.map((item) => ({
      question: item.question,
      mode: item.executionMode,
      tools: item.tools.join(", ") || "—",
      grounded: item.groundingPassed ? "yes" : "no",
      context: item.contextualRouting ? "yes" : "no",
      answer: item.answer.replace(/\s+/g, " ").slice(0, 100),
    })),
  );

  const failed = results.filter((item) => !item.groundingPassed || !item.answer.trim());
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error("Cycle 11 conversational audit failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
