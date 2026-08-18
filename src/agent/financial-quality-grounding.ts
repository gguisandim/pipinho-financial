import type { AgentToolTrace } from "./financial-agent.types.js";

export type FinancialQualityViolationCode =
  | "unavailable_savings_claim"
  | "insufficient_income_claim";

export interface FinancialQualityViolation {
  code: FinancialQualityViolationCode;
  sentence: string;
  detail: string;
}

export interface FinancialQualityGroundingEvaluation {
  passed: boolean;
  violations: FinancialQualityViolation[];
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function toolResults(tools: AgentToolTrace[]): Array<Record<string, unknown>> {
  return tools
    .filter((tool) => tool.outcome === "executed")
    .map((tool) => tool.result)
    .filter(
      (value): value is Record<string, unknown> =>
        !!value && typeof value === "object" && !Array.isArray(value),
    );
}

function savingsUnavailable(tools: AgentToolTrace[]): boolean {
  return toolResults(tools).some((result) => {
    const savings = result.savings;
    if (
      savings &&
      typeof savings === "object" &&
      !Array.isArray(savings) &&
      (savings as Record<string, unknown>).available === false
    ) {
      return true;
    }

    const quality = result.quality;
    return (
      !!quality &&
      typeof quality === "object" &&
      !Array.isArray(quality) &&
      (quality as Record<string, unknown>).savingsAvailable === false
    );
  });
}

function incomeInsufficient(tools: AgentToolTrace[]): boolean {
  return toolResults(tools).some((result) => {
    const income = result.income;
    if (income && typeof income === "object" && !Array.isArray(income)) {
      if ((income as Record<string, unknown>).quality === "insufficient") return true;
    }

    const quality = result.quality;
    return (
      !!quality &&
      typeof quality === "object" &&
      !Array.isArray(quality) &&
      (quality as Record<string, unknown>).incomeQuality === "insufficient"
    );
  });
}

function clearlyStatesUnavailable(sentence: string): boolean {
  return /\b(n\/d|indispon[ií]vel|insuficiente|n[aã]o\s+(?:[ée]\s+)?poss[ií]vel|n[aã]o\s+(?:pode|consigo|temos)|sem\s+evid[eê]ncia)\b/i.test(
    sentence,
  );
}

export function evaluateFinancialQualityGrounding(
  answer: string,
  tools: AgentToolTrace[],
): FinancialQualityGroundingEvaluation {
  const violations: FinancialQualityViolation[] = [];
  const noSavings = savingsUnavailable(tools);
  const weakIncome = incomeInsufficient(tools);

  for (const sentence of splitSentences(answer)) {
    if (clearlyStatesUnavailable(sentence)) continue;

    if (
      noSavings &&
      /(taxa de poupan[cç]a|savings rate|poupan[cç]a estimada)/i.test(sentence) &&
      /(?:R\$\s*)?-?\d[\d\s.,]*\s*%?/i.test(sentence)
    ) {
      violations.push({
        code: "unavailable_savings_claim",
        sentence,
        detail:
          "As ferramentas marcaram savings.available=false; a resposta não pode publicar valor ou taxa de poupança.",
      });
    }

    if (
      weakIncome &&
      /\b(renda|receita)\b/i.test(sentence) &&
      /R\$\s*\d|\b\d[\d\s.]*,\d{2}\b/i.test(sentence) &&
      !/(confirmad|estimad|baixa\s+confian[cç]a|classificad)/i.test(sentence)
    ) {
      violations.push({
        code: "insufficient_income_claim",
        sentence,
        detail:
          "A qualidade de renda é insufficient; valores só podem ser citados com o rótulo de evidência correspondente, nunca como renda total factual.",
      });
    }
  }

  return { passed: violations.length === 0, violations };
}

export function sanitizeFinancialQualityGrounding(
  answer: string,
  violations: FinancialQualityViolation[],
): string {
  if (violations.length === 0) return answer;
  const blocked = new Set(violations.map((violation) => violation.sentence));
  const safe = splitSentences(answer).filter((sentence) => !blocked.has(sentence));
  const suffix =
    "As métricas de renda e poupança devem respeitar os indicadores de qualidade do backend; quando a evidência é insuficiente, elas permanecem indisponíveis em vez de serem estimadas como fatos.";
  return [...safe, suffix].join("\n\n").trim();
}
