import { z } from "zod";
import type { TransactionCategory } from "../domain/finance.js";
import { syntheticTransactions } from "../fixtures/synthetic-transactions.js";
import {
  getAvailablePeriod,
  getFinancialDataCapabilities,
  queryCashFlow,
  queryIncome,
  queryLargestExpenses,
  querySpendingByCategory,
} from "../financial-engine/queries.js";
import type { ToolDefinition } from "../llm/tool-calling/tool-calling.types.js";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use data ISO no formato YYYY-MM-DD");

const dateRangeShape = {
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
};

const noArgumentsSchema = z.object({}).strict();
const dateRangeSchema = z.object(dateRangeShape).strict();

const categorySchema = z.enum([
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
]);

const spendingSchema = z
  .object({
    ...dateRangeShape,
    category: categorySchema.optional(),
  })
  .strict();

const largestExpensesSchema = z
  .object({
    ...dateRangeShape,
    limit: z.number().int().min(1).max(10).optional().default(5),
  })
  .strict();

export type FinancialToolName =
  | "get_financial_period"
  | "get_cash_flow"
  | "get_income"
  | "get_spending_by_category"
  | "get_largest_expenses"
  | "get_data_capabilities";

export const financialToolDefinitions: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_financial_period",
      description:
        "Retorna o intervalo de datas realmente disponível no conjunto financeiro atual. Use quando precisar confirmar cobertura temporal dos dados.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cash_flow",
      description:
        "Calcula deterministicamente receitas, despesas, fluxo líquido e taxa de poupança. Pode filtrar por período. Use para perguntas gerais de fluxo financeiro.",
      parameters: {
        type: "object",
        properties: {
          startDate: {
            type: "string",
            description: "Data inicial inclusiva em YYYY-MM-DD.",
          },
          endDate: {
            type: "string",
            description: "Data final inclusiva em YYYY-MM-DD.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_income",
      description:
        "Retorna a receita total calculada pelo backend para o período solicitado.",
      parameters: {
        type: "object",
        properties: {
          startDate: {
            type: "string",
            description: "Data inicial inclusiva em YYYY-MM-DD.",
          },
          endDate: {
            type: "string",
            description: "Data final inclusiva em YYYY-MM-DD.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_spending_by_category",
      description:
        "Retorna despesas agregadas por categoria. Quando category for informada, retorna somente essa categoria. Pode filtrar por período.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
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
            ],
            description: "Categoria financeira canônica, quando a pergunta indicar uma categoria específica.",
          },
          startDate: {
            type: "string",
            description: "Data inicial inclusiva em YYYY-MM-DD.",
          },
          endDate: {
            type: "string",
            description: "Data final inclusiva em YYYY-MM-DD.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_largest_expenses",
      description:
        "Retorna as maiores transações de despesa do período. Use quando a pergunta pedir maiores compras, gastos individuais ou concentração em transações específicas.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Quantidade de despesas, entre 1 e 10. Padrão 5.",
          },
          startDate: {
            type: "string",
            description: "Data inicial inclusiva em YYYY-MM-DD.",
          },
          endDate: {
            type: "string",
            description: "Data final inclusiva em YYYY-MM-DD.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_data_capabilities",
      description:
        "Informa quais campos e análises existem ou não existem no dataset atual. Use para perguntas sobre banco, conta, saldo, investimento, cartão, empréstimo ou outra dimensão que possa não estar disponível.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
];

function parseRawArguments(rawArguments: string): unknown {
  if (!rawArguments.trim()) return {};

  try {
    return JSON.parse(rawArguments);
  } catch (error) {
    throw new Error(
      `Argumentos da tool não são JSON válido: ${error instanceof Error ? error.message : "erro desconhecido"}`,
    );
  }
}

export function executeFinancialTool(
  name: string,
  rawArguments: string,
): unknown {
  const raw = parseRawArguments(rawArguments);

  switch (name as FinancialToolName) {
    case "get_financial_period": {
      noArgumentsSchema.parse(raw);
      return getAvailablePeriod(syntheticTransactions);
    }

    case "get_cash_flow": {
      const args = dateRangeSchema.parse(raw);
      return queryCashFlow(syntheticTransactions, args);
    }

    case "get_income": {
      const args = dateRangeSchema.parse(raw);
      return queryIncome(syntheticTransactions, args);
    }

    case "get_spending_by_category": {
      const args = spendingSchema.parse(raw);
      return querySpendingByCategory(syntheticTransactions, {
        ...args,
        category: args.category as TransactionCategory | undefined,
      });
    }

    case "get_largest_expenses": {
      const args = largestExpensesSchema.parse(raw);
      return queryLargestExpenses(syntheticTransactions, args);
    }

    case "get_data_capabilities": {
      noArgumentsSchema.parse(raw);
      return getFinancialDataCapabilities();
    }

    default:
      throw new Error(`Tool financeira desconhecida: ${name}`);
  }
}
