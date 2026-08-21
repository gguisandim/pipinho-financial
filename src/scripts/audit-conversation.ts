import { createGroqRealFinancialAgentService } from "../services/real-financial-agent-groq.factory.js";
import type { ConversationHistoryMessage } from "../agent/conversation-context.js";

interface CaseResult {
  question: string;
  answer: string;
  executionMode: string;
  tools: string[];
  expectedTools: string[];
  groundingPassed: boolean;
  contextualRouting: boolean;
}

async function run() {
  const agent = createGroqRealFinancialAgentService();
  const history: ConversationHistoryMessage[] = [];
  const results: CaseResult[] = [];

  const conversationQuestions = [
    { question: "Quanto eu gastei este mês?", expectedTools: ["get_spending_summary"] },
    { question: "E mês passado?", expectedTools: ["get_spending_summary"] },
    { question: "E no Nubank?", expectedTools: ["get_spending_by_institution"] },
  ];

  for (const testCase of conversationQuestions) {
    const { question, expectedTools } = testCase;
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
      expectedTools,
      groundingPassed: Object.values(result.grounding).every((item) => item.passed),
      contextualRouting: result.conversation.contextualRouting,
    });
    history.push({ role: "user", content: question });
    history.push({ role: "assistant", content: result.answer });
  }

  for (const testCase of [
    { question: "Qual foi meu último gasto?", expectedTools: ["get_recent_transactions"] },
    { question: "Quanto eu costumo gastar por dia?", expectedTools: ["get_daily_spending_summary"] },
    { question: "Quanto foi aquele Uber de ontem?", expectedTools: ["search_transactions"] },
    { question: "Quanto foi aquele Uberr de ontem?", expectedTools: ["search_transactions"] },
    { question: "Quanto eu tenho agora?", expectedTools: ["get_account_balances"] },
    { question: "Quanto tem no roxinho?", expectedTools: ["get_account_balances"] },
    { question: "oi", expectedTools: [] },
  ]) {
    const { question, expectedTools } = testCase;
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
      expectedTools,
      groundingPassed: Object.values(result.grounding).every((item) => item.passed),
      contextualRouting: result.conversation.contextualRouting,
    });
  }


  const memoryFallback = await agent.answer("E no roxinho?", {
    conversationId: "cycle11-audit-memory",
    history: [],
    memorySummary: "Perguntas anteriores desta conversa: Quanto eu tenho agora?",
  });
  results.push({
    question: "E no roxinho? (memória persistente)",
    answer: memoryFallback.answer,
    executionMode: memoryFallback.executionMode,
    tools: memoryFallback.toolCalls
      .filter((tool) => tool.outcome === "executed")
      .map((tool) => tool.name),
    expectedTools: ["get_account_balances"],
    groundingPassed: Object.values(memoryFallback.grounding).every((item) => item.passed),
    contextualRouting: memoryFallback.conversation.contextualRouting,
  });

  console.table(
    results.map((item) => ({
      question: item.question,
      mode: item.executionMode,
      tools: item.tools.join(", ") || "—",
      grounded: item.groundingPassed ? "yes" : "no",
      context: item.contextualRouting ? "yes" : "no",
      expected: item.expectedTools.join(", ") || "—",
      answer: item.answer.replace(/\s+/g, " ").slice(0, 100),
    })),
  );

  const failed = results.filter((item) => {
    const missingExpectedTool = item.expectedTools.some(
      (toolName) => !item.tools.includes(toolName),
    );
    const unexpectedToolForConversation =
      item.expectedTools.length === 0 && item.tools.length > 0;

    return (
      !item.groundingPassed ||
      !item.answer.trim() ||
      missingExpectedTool ||
      unexpectedToolForConversation
    );
  });
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error("Cycle 11 conversational audit failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
