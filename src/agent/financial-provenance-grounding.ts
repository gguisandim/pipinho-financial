import type { AgentToolTrace } from "./financial-agent.types.js";

export type FinancialProvenanceViolationCode =
  | "wrong_double_count_attribution"
  | "wrong_income_attribution"
  | "unsupported_category_sample_claim"
  | "internal_tool_name_exposure";

export interface FinancialProvenanceViolation {
  code: FinancialProvenanceViolationCode;
  sentence: string;
  detail: string;
}

export interface FinancialProvenanceGroundingEvaluation {
  passed: boolean;
  violations: FinancialProvenanceViolation[];
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function executedToolNames(tools: AgentToolTrace[]): Set<string> {
  return new Set(
    tools.filter((tool) => tool.outcome === "executed").map((tool) => tool.name),
  );
}

export function evaluateFinancialProvenanceGrounding(
  answer: string,
  tools: AgentToolTrace[],
): FinancialProvenanceGroundingEvaluation {
  const violations: FinancialProvenanceViolation[] = [];
  const names = executedToolNames(tools);

  for (const sentence of splitSentences(answer)) {
    if (
      /pluggy/i.test(sentence) &&
      /(dupla\s+contagem|pagamento\s+de\s+fatura)/i.test(sentence) &&
      /(remove|removeu|evita|evitou|elimina|eliminou|desconta|descontou|j[aá]\s+remove)/i.test(
        sentence,
      )
    ) {
      violations.push({
        code: "wrong_double_count_attribution",
        sentence,
        detail:
          "A proteção contra dupla contagem é aplicada pelo Financial Engine/backend depois da normalização dos dados; não deve ser atribuída à Pluggy.",
      });
    }

    if (
      /pluggy/i.test(sentence) &&
      /(?:reconhec|classific|identific)[a-zçãõ]*/i.test(sentence) &&
      /\b(renda|receita)\b/i.test(sentence)
    ) {
      violations.push({
        code: "wrong_income_attribution",
        sentence,
        detail:
          "A classificação final de renda é decidida pelo mapper/Financial Engine usando evidências do provider e regras locais; não atribua o resultado diretamente à Pluggy.",
      });
    }

    if (
      /(categor(?:ia|ias)|cobertura\s+por\s+categoria)/i.test(sentence) &&
      /(amostra|amostras|amostragem|n[aã]o\s+representa(?:m)?\s+todas)/i.test(sentence) &&
      !names.has("get_category_transactions")
    ) {
      violations.push({
        code: "unsupported_category_sample_claim",
        sentence,
        detail:
          "Agregações de get_spending_by_category/get_cash_flow usam todas as transações classificadas do período. Somente get_category_transactions devolve amostra limitada.",
      });
    }

    if (/\bget_[a-z0-9_]+\b/i.test(sentence)) {
      violations.push({
        code: "internal_tool_name_exposure",
        sentence,
        detail:
          "Nomes internos de tools são detalhes de implementação e não devem aparecer na resposta final ao usuário.",
      });
    }
  }

  return { passed: violations.length === 0, violations };
}

export function sanitizeFinancialProvenanceGrounding(
  answer: string,
  violations: FinancialProvenanceViolation[],
): string {
  if (violations.length === 0) return answer;

  const bySentence = new Map<string, FinancialProvenanceViolation[]>();
  for (const violation of violations) {
    const current = bySentence.get(violation.sentence) ?? [];
    current.push(violation);
    bySentence.set(violation.sentence, current);
  }

  const toolLabels: Record<string, string> = {
    get_financial_period: "a consulta do período disponível",
    get_cash_flow: "a análise de fluxo financeiro",
    get_spending_summary: "a análise do total de gastos",
    get_savings_status: "a análise de poupança",
    get_income: "a análise de renda",
    get_spending_by_category: "a análise por categoria",
    get_category_transactions: "a composição da categoria",
    get_largest_expenses: "a análise dos maiores gastos",
    get_spending_by_institution: "a comparação por instituição",
    get_monthly_financial_trend: "a análise de evolução mensal",
    get_account_balances: "a consulta de saldos das contas",
    get_recent_transactions: "a consulta de movimentações recentes",
    search_transactions: "a busca de movimentações",
    get_daily_spending_summary: "a análise de gasto diário",
    get_data_capabilities: "a verificação dos dados disponíveis",
  };

  const rewritten = splitSentences(answer).map((sentence) => {
    const sentenceViolations = bySentence.get(sentence);
    if (!sentenceViolations?.length) return sentence;

    let safe = sentence;
    const codes = new Set(sentenceViolations.map((item) => item.code));

    if (
      codes.has("wrong_double_count_attribution") ||
      codes.has("wrong_income_attribution")
    ) {
      safe = safe
        .replace(/\bO Pluggy\b/g, "O backend")
        .replace(/\bo Pluggy\b/g, "o backend")
        .replace(/\bPluggy\b/g, "o backend");
    }

    if (codes.has("unsupported_category_sample_claim")) {
      safe =
        "A cobertura por categoria depende da qualidade de classificação disponível no período.";
    }

    if (codes.has("internal_tool_name_exposure")) {
      safe = safe.replace(/\bget_[a-z0-9_]+\b/gi, (name) =>
        toolLabels[name.toLowerCase()] ?? "a análise correspondente",
      );
    }

    return safe;
  });

  return rewritten.join("\n\n").trim();
}
