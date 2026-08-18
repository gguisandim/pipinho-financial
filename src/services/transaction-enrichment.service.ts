import type { StructuredLlmProvider } from "../llm/providers/structured-llm-provider.js";
import {
  ExpenseEnrichmentBatchSchema,
  type ExpenseEnrichmentBatch,
  type ExpenseEnrichmentSuggestion,
} from "../llm/schemas/transaction-enrichment.schema.js";
import {
  TRANSACTION_ENRICHMENT_SYSTEM_PROMPT,
  buildTransactionEnrichmentPrompt,
} from "../llm/prompts/transaction-enrichment.prompt.js";
import type { TransactionRepository } from "../repositories/transaction.repository.js";
import {
  buildEnrichmentCandidates,
  type EnrichmentCandidate,
} from "../enrichment/enrichment-candidates.js";

export interface TransactionEnrichmentScanOptions {
  minOccurrences?: number;
  maxExpenseGroups?: number;
  maxInflowGroups?: number;
}

export interface TransactionEnrichmentScan {
  source: string;
  fetchedAt: string;
  transactionCount: number;
  expenseCandidates: EnrichmentCandidate[];
  inflowCandidates: EnrichmentCandidate[];
  eligibleExpenseCandidates: EnrichmentCandidate[];
  skippedExpenseCandidates: EnrichmentCandidate[];
}

export interface ExpenseEnrichmentClassification {
  suggestions: ExpenseEnrichmentSuggestion[];
  invalidSuggestionIds: string[];
  missingCandidateIds: string[];
  provider: string;
  model: string;
  latencyMs: number;
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export class TransactionEnrichmentService {
  constructor(
    private readonly repository: TransactionRepository,
    private readonly classifier?: StructuredLlmProvider,
  ) {}

  async scan(options: TransactionEnrichmentScanOptions = {}): Promise<TransactionEnrichmentScan> {
    const minOccurrences = Math.max(1, options.minOccurrences ?? 2);
    const maxExpenseGroups = Math.max(1, options.maxExpenseGroups ?? 12);
    const maxInflowGroups = Math.max(1, options.maxInflowGroups ?? 12);
    const snapshot = await this.repository.listTransactions({ includePending: false });
    const candidates = buildEnrichmentCandidates(snapshot.transactions);

    const expenseCandidates = candidates.expenseCandidates;
    const eligibleExpenseCandidates = expenseCandidates
      .filter(
        (candidate) =>
          candidate.llmEligible && candidate.occurrenceCount >= minOccurrences,
      )
      .slice(0, maxExpenseGroups);

    const eligibleIds = new Set(eligibleExpenseCandidates.map((candidate) => candidate.id));
    const skippedExpenseCandidates = expenseCandidates.filter(
      (candidate) => !eligibleIds.has(candidate.id),
    );

    return {
      source: snapshot.source,
      fetchedAt: snapshot.fetchedAt,
      transactionCount: snapshot.transactions.length,
      expenseCandidates,
      inflowCandidates: candidates.inflowCandidates.slice(0, maxInflowGroups),
      eligibleExpenseCandidates,
      skippedExpenseCandidates,
    };
  }

  async classifyExpenses(
    scan: TransactionEnrichmentScan,
  ): Promise<ExpenseEnrichmentClassification | null> {
    if (!this.classifier || scan.eligibleExpenseCandidates.length === 0) return null;

    const response = await this.classifier.completeStructured<ExpenseEnrichmentBatch>({
      system: TRANSACTION_ENRICHMENT_SYSTEM_PROMPT,
      user: buildTransactionEnrichmentPrompt(scan.eligibleExpenseCandidates),
      schemaName: "expense_enrichment_batch",
      schema: ExpenseEnrichmentBatchSchema,
    });

    const knownIds = new Set(scan.eligibleExpenseCandidates.map((candidate) => candidate.id));
    const suggestions = response.data.suggestions.filter(
      (suggestion: ExpenseEnrichmentSuggestion) =>
        knownIds.has(suggestion.candidateId),
    );
    const invalidSuggestionIds = response.data.suggestions
      .filter(
        (suggestion: ExpenseEnrichmentSuggestion) =>
          !knownIds.has(suggestion.candidateId),
      )
      .map((suggestion: ExpenseEnrichmentSuggestion) => suggestion.candidateId);
    const returnedIds = new Set(
      suggestions.map((suggestion: ExpenseEnrichmentSuggestion) => suggestion.candidateId),
    );
    const missingCandidateIds = scan.eligibleExpenseCandidates
      .map((candidate) => candidate.id)
      .filter((id) => !returnedIds.has(id));

    return {
      suggestions,
      invalidSuggestionIds,
      missingCandidateIds,
      provider: response.provider,
      model: response.model,
      latencyMs: response.latencyMs,
      usage: response.usage,
    };
  }
}
