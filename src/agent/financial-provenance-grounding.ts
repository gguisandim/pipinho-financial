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
  const blocked = new Set(violations.map((violation) => violation.sentence));
  const safe = splitSentences(answer).filter((sentence) => !blocked.has(sentence));
  return safe.join("\n\n").trim();
}
