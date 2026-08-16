import { z } from "zod";

export const FinancialFactSchema = z.object({
  type: z.enum([
    "period",
    "income",
    "expense",
    "net_cash_flow",
    "savings_rate",
    "expense_category",
  ]),
  label: z.string(),
  value: z.number().nullable(),
  unit: z.enum(["BRL", "percent", "count", "date_range"]),
});

export const FinancialAnalysisSchema = z.object({
  status: z.enum(["answered", "insufficient_data"]),
  answer: z.string(),
  facts: z.array(FinancialFactSchema),
  missingData: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type FinancialAnalysis = z.infer<typeof FinancialAnalysisSchema>;
