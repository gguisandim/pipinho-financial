import { z } from "zod";

export const ExpenseEnrichmentCategorySchema = z.enum([
  "housing",
  "groceries",
  "food_delivery",
  "transport",
  "utilities",
  "subscriptions",
  "health",
  "restaurants",
  "education",
  "fitness",
  "shopping",
  "financial_charges",
  "other",
]);

export const ExpenseEnrichmentSuggestionSchema = z.object({
  candidateId: z.string().min(1),
  category: ExpenseEnrichmentCategorySchema,
  confidence: z.enum(["low", "medium", "high"]),
  reason: z.string().min(1).max(140),
});

export const ExpenseEnrichmentBatchSchema = z.object({
  suggestions: z.array(ExpenseEnrichmentSuggestionSchema),
});

export type ExpenseEnrichmentSuggestion = z.infer<
  typeof ExpenseEnrichmentSuggestionSchema
>;
export type ExpenseEnrichmentBatch = z.infer<
  typeof ExpenseEnrichmentBatchSchema
>;
