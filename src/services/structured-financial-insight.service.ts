import { syntheticTransactions } from "../fixtures/synthetic-transactions.js";
import { summarizeTransactions } from "../financial-engine/summarize.js";
import {
  buildStructuredFinancialPrompt,
  FINANCIAL_STRUCTURED_SYSTEM_PROMPT,
} from "../llm/prompts/financial-structured.prompt.js";
import type { StructuredLlmProvider } from "../llm/providers/structured-llm-provider.js";
import { FinancialAnalysisSchema } from "../llm/schemas/financial-analysis.schema.js";

export class StructuredFinancialInsightService {
  constructor(private readonly llm: StructuredLlmProvider) {}

  async analyze(question: string) {
    const summary = summarizeTransactions(syntheticTransactions);

    const llmResponse = await this.llm.completeStructured({
      system: FINANCIAL_STRUCTURED_SYSTEM_PROMPT,
      user: buildStructuredFinancialPrompt(summary, question),
      schemaName: "financial_analysis",
      schema: FinancialAnalysisSchema,
    });

    return {
      question,
      summary,
      analysis: llmResponse.data,
      llm: {
        provider: llmResponse.provider,
        model: llmResponse.model,
        latencyMs: llmResponse.latencyMs,
        usage: llmResponse.usage,
      },
    };
  }
}
