import { z } from "zod";
import type { TransactionCategory } from "../domain/finance.js";
import type { ToolDefinition } from "../llm/tool-calling/tool-calling.types.js";
import { RealFinancialDataService, type SpendingCategoryGroup } from "../services/real-financial-data.service.js";

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
  "financial_charges",
  "other",
]);

const spendingSchema = z
  .object({
    ...dateRangeShape,
    category: categorySchema.optional(),
    categoryGroup: z.enum(["food"]).optional(),
  })
  .strict()
  .refine((value) => !(value.category && value.categoryGroup), {
    message: "Use category ou categoryGroup, não ambos.",
  });

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

const monthlyTrendSchema = z
  .object({
    ...dateRangeShape,
    months: z.number().int().min(1).max(24).optional().default(12),
  })
  .strict();

const institutionSchema = z
  .object({
    ...dateRangeShape,
    institution: z.string().min(1).max(100).optional(),
  })
  .strict();

const accountBalancesSchema = z
  .object({
    institution: z.string().min(1).max(100).optional(),
  })
  .strict();

const transactionKindSchema = z.enum(["all", "spending", "income"]);

const recentTransactionsSchema = z
  .object({
    ...dateRangeShape,
    limit: z.number().int().min(1).max(20).optional().default(5),
    kind: transactionKindSchema.optional().default("all"),
  })
  .strict();

const searchTransactionsSchema = z
  .object({
    ...dateRangeShape,
    query: z.string().trim().min(2).max(100),
    limit: z.number().int().min(1).max(20).optional().default(10),
    kind: transactionKindSchema.optional().default("all"),
  })
  .strict();

export type RealFinancialToolName =
  | "get_financial_period"
  | "get_cash_flow"
  | "get_spending_summary"
  | "get_savings_status"
  | "get_income"
  | "get_spending_by_category"
  | "get_category_transactions"
  | "get_largest_expenses"
  | "get_spending_by_institution"
  | "get_monthly_financial_trend"
  | "get_account_balances"
  | "get_recent_transactions"
  | "search_transactions"
  | "get_daily_spending_summary"
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
      name: "get_spending_summary",
      description:
        "Retorna somente o spending econômico do período: gastos BANK, compras no cartão, refunds conhecidos e netSpending sem dupla contagem de fatura. Prefira esta tool para perguntas como quanto gastei ou total de gastos.",
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
      name: "get_savings_status",
      description:
        "Retorna o status de poupança/taxa de poupança e a qualidade da renda. Use para perguntas sobre quanto economizei, poupança ou savings rate. Se savings.available=false, responda que a métrica está indisponível e explique o motivo; não use get_data_capabilities para isso.",
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
        "Retorna spending real agregado por categoria após remover dupla contagem de fatura/transferências. Para alimentação como conceito amplo, use categoryGroup=food, que agrega groceries + food_delivery + restaurants no backend. category pode ser omitida para comparar todas as categorias.",
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
                  "financial_charges",
                  "other",
                ],
              },
              { type: "null" },
            ],
            description:
              "Categoria canônica. Use null ou omita quando não houver categoria específica.",
          },
          categoryGroup: {
            anyOf: [
              { type: "string", enum: ["food"] },
              { type: "null" },
            ],
            description:
              "Grupo determinístico de categorias. food = groceries + food_delivery + restaurants. Não use junto com category.",
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
              "financial_charges",
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
      name: "get_monthly_financial_trend",
      description:
        "Retorna série mensal determinística de liquidez, spending, renda com qualidade e savings. Use para evolução mensal, tendência, comparação entre meses ou gráficos temporais; não invente meses fora dos pontos retornados.",
      parameters: {
        type: "object",
        properties: {
          ...nullableDateProperties,
          months: {
            type: ["number", "null"],
            description: "Quantidade de meses retornados, de 1 a 24. Padrão 12.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_account_balances",
      description:
        "Retorna saldos atuais das Accounts Pluggy sem expor accountId/itemId. Soma somente contas BANK no saldo bancário agregado; contas CREDIT são listadas separadamente e nunca entram no total disponível. institution é opcional.",
      parameters: {
        type: "object",
        properties: {
          institution: {
            anyOf: [{ type: "string" }, { type: "null" }],
            description: "Instituição específica, por exemplo Nubank, Neon ou PicPay. Omita para todas.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_transactions",
      description:
        "Retorna as movimentações mais recentes usando a data disponível no dataset. Use para perguntas como último gasto, última compra, últimas movimentações ou o que comprei recentemente. Para gasto/compra use kind=spending; para renda identificada use kind=income.",
      parameters: {
        type: "object",
        properties: {
          ...nullableDateProperties,
          limit: {
            type: ["number", "null"],
            description: "Quantidade de movimentações, de 1 a 20. Padrão 5.",
          },
          kind: {
            anyOf: [
              { type: "string", enum: ["all", "spending", "income"] },
              { type: "null" },
            ],
            description: "Filtra todas as movimentações, somente spending econômico ou somente renda identificada.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_transactions",
      description:
        "Busca movimentações por texto em descrição, instituição ou nome de conta. Use quando o usuário citar algo como Uber, iFood, mercado, um banco ou perguntar por 'aquele gasto'. A busca é limitada e não envia o extrato inteiro ao LLM.",
      parameters: {
        type: "object",
        properties: {
          ...nullableDateProperties,
          query: {
            type: "string",
            description: "Texto literal principal a procurar, por exemplo Uber, iFood ou Nubank.",
          },
          limit: {
            type: ["number", "null"],
            description: "Quantidade máxima de resultados, de 1 a 20. Padrão 10.",
          },
          kind: {
            anyOf: [
              { type: "string", enum: ["all", "spending", "income"] },
              { type: "null" },
            ],
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_daily_spending_summary",
      description:
        "Calcula no backend gasto total, média por dia civil, média por dia com gasto e o dia de maior gasto. Também retorna no máximo 31 pontos diários recentes. Use para perguntas como quanto costumo gastar por dia, média diária ou padrão diário de spending.",
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
      name: "get_data_capabilities",
      description:
        "Informa campos, análises, limitações e qualidade do dataset Pluggy atual. Use apenas para dimensões ainda não integradas, como investimentos, empréstimos ou projeção de fatura. NÃO use para saldo bancário, spending, renda, poupança/savings, categorias, instituições ou tendência mensal, pois existem tools específicas. Não aceita argumentos.",
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

      case "get_spending_summary": {
        const args = dateRangeSchema.parse(raw);
        return this.data.getSpendingSummary(args);
      }

      case "get_savings_status": {
        const args = dateRangeSchema.parse(raw);
        return this.data.getSavingsStatus(args);
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
          categoryGroup: args.categoryGroup as SpendingCategoryGroup | undefined,
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

      case "get_monthly_financial_trend": {
        const args = monthlyTrendSchema.parse(raw);
        return this.data.getMonthlySeries(args);
      }

      case "get_account_balances": {
        const args = accountBalancesSchema.parse(raw);
        return this.data.getAccountBalances(args);
      }

      case "get_recent_transactions": {
        const args = recentTransactionsSchema.parse(raw);
        return this.data.getRecentTransactions(args);
      }

      case "search_transactions": {
        const args = searchTransactionsSchema.parse(raw);
        return this.data.searchTransactions(args);
      }

      case "get_daily_spending_summary": {
        const args = dateRangeSchema.parse(raw);
        return this.data.getDailySpendingSummary(args);
      }

      case "get_data_capabilities":
        noArgumentsSchema.parse(raw);
        return this.data.getDataCapabilities();

      default:
        throw new Error(`Tool financeira real desconhecida: ${name}`);
    }
  }
}
