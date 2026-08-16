import { syntheticTransactions } from "../fixtures/synthetic-transactions.js";
import { summarizeTransactions } from "../financial-engine/summarize.js";
import { buildFinancialSummaryPrompt, FINANCIAL_SYSTEM_PROMPT } from "../llm/prompts/financial-summary.prompt.js";
import type { LlmProvider } from "../llm/providers/llm-provider.js";

export class FinancialInsightService {
  constructor(private readonly llm: LlmProvider) {}

  async explain(question: string) {
    const summary = summarizeTransactions(syntheticTransactions);

    const llmResponse = await this.llm.complete({
      system: FINANCIAL_SYSTEM_PROMPT,
      user: buildFinancialSummaryPrompt(summary, question),
    });

    return {
      question,
      summary,
      answer: llmResponse.text,
      llm: {
        provider: llmResponse.provider,
        model: llmResponse.model,
        latencyMs: llmResponse.latencyMs,
        usage: llmResponse.usage,
      },
    };
  }
}
