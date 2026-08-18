import { z } from "zod";
import type { TransactionCategory } from "../domain/finance.js";
import type { ToolDefinition } from "../llm/tool-calling/tool-calling.types.js";
import { RealFinancialDataService } from "../services/real-financial-data.service.js";

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
  "other",
]);

const spendingSchema = z
  .object({
    ...dateRangeShape,
    category: categorySchema.optional(),
  })
  .strict();

const categoryTransactionsSchema = z
  .object({
    ...dateRangeShape,
    category: categorySchema,
    limit: z.number().int().min(1).max(20).optional().default(10),
  })
  .strict();

const largestExpensesSchema = z
  .object({
    ...dateRangeShape,
    limit: z.number().int().min(1).max(10).optional().default(5),
  })
  .strict();

const institutionSchema = z
  .object({
    ...dateRangeShape,
    institution: z.string().min(1).max(100).optional(),
  })
  .strict();

export type RealFinancialToolName =
  | "get_financial_period"
  | "get_cash_flow"
  | "get_income"
  | "get_spending_by_category"
  | "get_category_transactions"
  | "get_largest_expenses"
  | "get_spending_by_institution"
  | "get_data_capabilities";

const nullableDateProperties = {
  startDate: {
    type: ["string", "null"],
    description:
      "Data inicial inclusiva em YYYY-MM-DD. Use null ou omita quando o usuário não informar período.",
  },
  endDate: {
    type: ["string", "null"],
    description:
      "Data final inclusiva em YYYY-MM-DD. Use null ou omita quando o usuário não informar período.",
  },
};

export const realFinancialToolDefinitions: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_financial_period",
      description:
        "Retorna o intervalo real disponível nas transações Pluggy já normalizadas. Não aceita argumentos.",
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
        "Retorna a visão financeira real do período: liquidez BANK, spending sem dupla contagem de cartão, qualidade de renda e savings somente quando a evidência permite. Se savings.available=false, NÃO invente savings nem savings rate.",
      parameters: {
        type: "object",
        properties: nullableDateProperties,
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_income",
      description:
        "Retorna renda confirmada, renda de baixa confiança, entradas bancárias não classificadas e metadados de qualidade. Não trate entradas não classificadas como renda.",
      parameters: {
        type: "object",
        properties: nullableDateProperties,
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_spending_by_category",
      description:
        "Retorna spending real agregado por categoria após remover dupla contagem de fatura/transferências. category pode ser omitida para comparar todas as categorias.",
      parameters: {
        type: "object",
        properties: {
          ...nullableDateProperties,
          category: {
            anyOf: [
              {
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
                  "other",
                ],
              },
              { type: "null" },
            ],
            description:
              "Categoria canônica. Use null ou omita quando não houver categoria específica.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_category_transactions",
      description:
        "Retorna uma amostra limitada das maiores transações que compõem uma categoria. Use para composição observada; não use a amostra para inventar causa comportamental.",
      parameters: {
        type: "object",
        properties: {
          ...nullableDateProperties,
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
              "other",
            ],
          },
          limit: {
            type: ["number", "null"],
            description: "Quantidade de transações retornadas, 1 a 20. Padrão 10.",
          },
        },
        required: ["category"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_largest_expenses",
      description:
        "Retorna os maiores gastos econômicos reais, excluindo pagamento de fatura e transferências próprias. Use para maiores compras/gastos individuais.",
      parameters: {
        type: "object",
        properties: {
          ...nullableDateProperties,
          limit: {
            type: ["number", "null"],
            description: "Quantidade de gastos, 1 a 10. Padrão 5.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_spending_by_institution",
      description:
        "Agrega spending real por instituição financeira. Use para comparar Nubank, Neon, PicPay ou outra instituição presente no dataset. institution é opcional para filtrar uma instituição.",
      parameters: {
        type: "object",
        properties: {
          ...nullableDateProperties,
          institution: {
            anyOf: [{ type: "string" }, { type: "null" }],
            description:
              "Nome ou trecho do nome da instituição. Omita para retornar todas.",
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
        "Informa campos, análises, limitações e qualidade do dataset Pluggy atual. Use antes de responder sobre saldos, investimentos, empréstimos ou outra dimensão ainda não integrada. Não aceita argumentos.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
];

function normalizeOptionalNulls(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== null),
  );
}

function parseRawArguments(rawArguments: string): unknown {
  if (!rawArguments.trim()) return {};
  return normalizeOptionalNulls(JSON.parse(rawArguments));
}

export class RealFinancialToolExecutor {
  constructor(private readonly data: RealFinancialDataService) {}

  async execute(name: string, rawArguments: string): Promise<unknown> {
    const raw = parseRawArguments(rawArguments);

    switch (name as RealFinancialToolName) {
      case "get_financial_period":
        noArgumentsSchema.parse(raw);
        return this.data.getFinancialPeriod();

      case "get_cash_flow": {
        const args = dateRangeSchema.parse(raw);
        return this.data.getCashFlow(args);
      }

      case "get_income": {
        const args = dateRangeSchema.parse(raw);
        return this.data.getIncome(args);
      }

      case "get_spending_by_category": {
        const args = spendingSchema.parse(raw);
        return this.data.getSpendingByCategory({
          ...args,
          category: args.category as TransactionCategory | undefined,
        });
      }

      case "get_category_transactions": {
        const args = categoryTransactionsSchema.parse(raw);
        return this.data.getCategoryTransactions({
          ...args,
          category: args.category as TransactionCategory,
        });
      }

      case "get_largest_expenses": {
        const args = largestExpensesSchema.parse(raw);
        return this.data.getLargestExpenses(args);
      }

      case "get_spending_by_institution": {
        const args = institutionSchema.parse(raw);
        return this.data.getSpendingByInstitution(args);
      }

      case "get_data_capabilities":
        noArgumentsSchema.parse(raw);
        return this.data.getDataCapabilities();

      default:
        throw new Error(`Tool financeira real desconhecida: ${name}`);
    }
  }
}
