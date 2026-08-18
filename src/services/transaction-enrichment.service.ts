import type {
  StructuredLlmProvider,
  StructuredLlmResponse,
} from "../llm/providers/structured-llm-provider.js";
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
  batchCount: number;
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface ExpenseClassificationOptions {
  batchSize?: number;
  maxCompletionTokens?: number;
}

function sumOptional(values: Array<number | undefined>): number | undefined {
  return values.every((value) => value === undefined)
    ? undefined
    : values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function isStructuredLengthError(error: unknown): boolean {
  const text = String(error).toLowerCase();
  return (
    text.includes("json_validate_failed") ||
    text.includes("max completion tokens") ||
    text.includes("failed to generate json")
  );
}

export class TransactionEnrichmentService {
  constructor(
    private readonly repository: TransactionRepository,
    private readonly classifier?: StructuredLlmProvider,
  ) {}

  private async classifyBatch(
    candidates: EnrichmentCandidate[],
    maxCompletionTokens: number,
  ): Promise<StructuredLlmResponse<ExpenseEnrichmentBatch>[]> {
    if (!this.classifier || candidates.length === 0) return [];

    try {
      const response = await this.classifier.completeStructured<ExpenseEnrichmentBatch>({
        system: TRANSACTION_ENRICHMENT_SYSTEM_PROMPT,
        user: buildTransactionEnrichmentPrompt(candidates),
        schemaName: "expense_enrichment_batch",
        schema: ExpenseEnrichmentBatchSchema,
        maxCompletionTokens,
      });
      return [response];
    } catch (error) {
      // Alguns modelos podem gastar o orçamento de completion antes de fechar
      // o JSON estrito. Em vez de derrubar todo o ciclo, divide o lote.
      if (!isStructuredLengthError(error) || candidates.length === 1) throw error;

      const middle = Math.ceil(candidates.length / 2);
      const left = await this.classifyBatch(
        candidates.slice(0, middle),
        maxCompletionTokens,
      );
      const right = await this.classifyBatch(
        candidates.slice(middle),
        maxCompletionTokens,
      );
      return [...left, ...right];
    }
  }

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
    options: ExpenseClassificationOptions = {},
  ): Promise<ExpenseEnrichmentClassification | null> {
    if (!this.classifier || scan.eligibleExpenseCandidates.length === 0) return null;

    const batchSize = Math.min(
      Math.max(options.batchSize ?? 4, 1),
      scan.eligibleExpenseCandidates.length,
    );
    const maxCompletionTokens = Math.max(options.maxCompletionTokens ?? 2400, 500);
    const responses: StructuredLlmResponse<ExpenseEnrichmentBatch>[] = [];

    for (let index = 0; index < scan.eligibleExpenseCandidates.length; index += batchSize) {
      const batch = scan.eligibleExpenseCandidates.slice(index, index + batchSize);
      responses.push(...(await this.classifyBatch(batch, maxCompletionTokens)));
    }

    const knownIds = new Set(scan.eligibleExpenseCandidates.map((candidate) => candidate.id));
    const rawSuggestions = responses.flatMap((response) => response.data.suggestions);
    const suggestions = rawSuggestions.filter(
      (suggestion: ExpenseEnrichmentSuggestion) => knownIds.has(suggestion.candidateId),
    );
    const invalidSuggestionIds = rawSuggestions
      .filter((suggestion: ExpenseEnrichmentSuggestion) => !knownIds.has(suggestion.candidateId))
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
      provider: responses[0]?.provider ?? "unknown",
      model: [...new Set(responses.map((response) => response.model))].join(", "),
      latencyMs: responses.reduce((total, response) => total + response.latencyMs, 0),
      batchCount: responses.length,
      usage: {
        promptTokens: sumOptional(responses.map((response) => response.usage.promptTokens)),
        completionTokens: sumOptional(
          responses.map((response) => response.usage.completionTokens),
        ),
        totalTokens: sumOptional(responses.map((response) => response.usage.totalTokens)),
      },
    };
  }
}
