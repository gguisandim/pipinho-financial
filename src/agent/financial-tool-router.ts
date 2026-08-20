import type { ToolDefinition } from "../llm/tool-calling/tool-calling.types.js";

export interface FinancialToolRoutingDecision {
  intent:
    | "conversation"
    | "period"
    | "savings"
    | "income"
    | "categories"
    | "category_composition"
    | "institutions"
    | "largest_expenses"
    | "recent_transactions"
    | "transaction_search"
    | "daily_spending"
    | "daily_comparison"
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

function normalized(question: string): string {
  return question
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function routeFinancialTools(question: string): FinancialToolRoutingDecision {
  const q = normalized(question);

  if (
    has(q, /^(oi|ola|opa|e ai|bom dia|boa tarde|boa noite|valeu|obrigad[oa]|tmj)[!.? ]*$/) ||
    has(q, /\b(quem e voce|o que voce faz|o que consegue fazer|como voce funciona|me ajuda|ajuda ai)\b/)
  ) {
    return { intent: "conversation", toolNames: [] };
  }

  if (has(q, /\b(periodo disponivel|intervalo disponivel|desde quando|ate quando|cobertura temporal)\b/)) {
    return { intent: "period", toolNames: ["get_financial_period"] };
  }

  if (has(q, /\b(ultimo gasto|ultima compra|ultima transacao|ultima movimentacao|ultimos gastos|ultimas compras|ultimas transacoes|movimentacoes recentes|gastei recentemente|comprei recentemente)\b/)) {
    return {
      intent: "recent_transactions",
      toolNames: ["get_recent_transactions"],
    };
  }

  if (
    has(q, /\b(procura|procurar|busca|buscar|encontra|encontrar|ache|achar)\b/) ||
    has(q, /\b(aquele|aquela)\b.*\b(gasto|compra|pagamento|transacao|uber|ifood)\b/) ||
    has(q, /\b(uber|ifood|i food)\b.*\b(quanto|valor|gasto|paguei|custou|foi)\b/)
  ) {
    return {
      intent: "transaction_search",
      toolNames: ["search_transactions"],
    };
  }

  if (has(q, /\b(media diaria|media de gasto por dia|media por dia|gasto por dia|gastos por dia|costumo gastar por dia|quanto gasto por dia)\b/)) {
    return {
      intent: "daily_spending",
      toolNames: ["get_daily_spending_summary"],
    };
  }

  if (has(q, /\b(gastei muito|gastei acima|gastei mais que o normal|fora do normal|acima do normal)\b/)) {
    return {
      intent: "daily_comparison",
      toolNames: ["get_spending_summary", "get_daily_spending_summary"],
    };
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

  if (has(q, /\b(fluxo financeiro|fluxo de caixa|liquidez(?: bancaria)?|cash flow|situacao financeira|resumo financeiro|visao geral financeira|analise financeira|minhas financas)\b/)) {
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

  if (has(q, /\b(saldo atual|saldo bancario|quanto eu tenho|quanto tenho|investimentos?|emprestimos?|financiamentos?|fatura(?: atual| futura)?|limite do cartao)\b/)) {
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
      "get_recent_transactions",
      "search_transactions",
      "get_daily_spending_summary",
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

  if (decision.toolNames.length === 0) {
    return { decision, tools: [] };
  }

  return {
    decision,
    tools: tools.length > 0 ? tools : definitions,
  };
}
