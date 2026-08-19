import type { ToolDefinition } from "../llm/tool-calling/tool-calling.types.js";

export interface FinancialToolRoutingDecision {
  intent:
    | "period"
    | "savings"
    | "income"
    | "categories"
    | "category_composition"
    | "institutions"
    | "largest_expenses"
    | "monthly_trend"
    | "cash_flow"
    | "spending"
    | "capabilities"
    | "general";
  toolNames: string[];
}

function has(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

export function routeFinancialTools(question: string): FinancialToolRoutingDecision {
  const q = question
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (has(q, /\b(periodo disponivel|intervalo disponivel|desde quando|ate quando|cobertura temporal)\b/)) {
    return { intent: "period", toolNames: ["get_financial_period"] };
  }

  if (has(q, /\b(taxa de poupanca|poupanca|economizei|economia|savings(?: rate)?)\b/)) {
    return {
      intent: "savings",
      toolNames: ["get_savings_status"],
    };
  }

  if (has(q, /\b(renda|receita|salario|ganhei|entradas de renda)\b/)) {
    return { intent: "income", toolNames: ["get_income"] };
  }

  if (
    has(q, /\b(composicao|compoe|dentro da categoria|transacoes? da categoria|gastos? de .+ categoria)\b/) &&
    has(q, /\b(categoria|other|housing|groceries|transport|shopping|subscriptions|financial charges|encargos financeiros)\b/)
  ) {
    return {
      intent: "category_composition",
      toolNames: ["get_spending_by_category", "get_category_transactions"],
    };
  }

  if (has(q, /\b(categoria|categorias|onde gasto|tipo de gasto|alimentacao|comida|mercado|supermercado|restaurante|delivery|transporte|moradia|assinaturas?|saude|educacao|academia|fitness|compras?|encargos financeiros)\b/)) {
    return {
      intent: "categories",
      toolNames: ["get_spending_by_category"],
    };
  }

  if (has(q, /\b(instituicao|instituicoes|banco|nubank|neon|picpay)\b/)) {
    return {
      intent: "institutions",
      toolNames: ["get_spending_by_institution"],
    };
  }

  if (has(q, /\b(maiores? gastos?|maiores? despesas?|top gastos?|compras? mais caras?|maiores? compras?)\b/)) {
    return {
      intent: "largest_expenses",
      toolNames: ["get_largest_expenses"],
    };
  }

  if (
    has(q, /\b(evolucao|tendencia|mes a mes|mensal|comparar meses|comparacao mensal|historico mensal)\b/) ||
    has(q, /\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b.*\b(?:e|ou|vs|versus)\b.*\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/)
  ) {
    return {
      intent: "monthly_trend",
      toolNames: ["get_monthly_financial_trend"],
    };
  }

  if (has(q, /\b(fluxo financeiro|fluxo de caixa|liquidez(?: bancaria)?|cash flow|situacao financeira|resumo financeiro|visao geral financeira|analise financeira|minhas financas|minhas finanças)\b/)) {
    return {
      intent: "cash_flow",
      toolNames: ["get_cash_flow"],
    };
  }

  if (has(q, /\b(quanto gastei|quanto eu gastei|total de gastos?|gasto total|spending|despesas? totais?|gastos?)\b/)) {
    return {
      intent: "spending",
      toolNames: ["get_spending_summary"],
    };
  }

  if (has(q, /\b(saldo atual|saldo bancario|investimentos?|emprestimos?|financiamentos?|fatura(?: atual| futura)?|limite do cartao)\b/)) {
    return {
      intent: "capabilities",
      toolNames: ["get_data_capabilities"],
    };
  }

  return {
    intent: "general",
    toolNames: [
      "get_cash_flow",
      "get_spending_summary",
      "get_income",
      "get_spending_by_category",
      "get_data_capabilities",
    ],
  };
}

export function selectFinancialToolDefinitions(
  question: string,
  definitions: ToolDefinition[],
): { decision: FinancialToolRoutingDecision; tools: ToolDefinition[] } {
  const decision = routeFinancialTools(question);
  const allowed = new Set(decision.toolNames);
  const tools = definitions.filter((tool) => allowed.has(tool.function.name));

  // Defesa: nunca deixa o agent sem ferramenta por divergência entre registry/router.
  return {
    decision,
    tools: tools.length > 0 ? tools : definitions,
  };
}
