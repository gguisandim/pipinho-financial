import type { BenchmarkConcept } from "./benchmark.types.js";

export function normalizeBenchmarkText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u00a0\u202f]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const conceptPatterns: Record<BenchmarkConcept, RegExp[]> = {
  cash_flow: [
    /\bfluxo financeiro\b/,
    /\bfluxo de caixa\b/,
    /\bfluxo liquido\b/,
  ],
  data_absence: [
    /\bsem (?:dados|registros|informacoes?|transacoes?)\b/,
    /\bnao (?:ha|existem?|temos?|tenho|possui|contem|constam?|foram encontrados?|disponho).{0,55}\b(?:dados|registros|informacoes?|transacoes?|investimentos?)\b/,
    /\b(?:dados|registros|informacoes?|transacoes?|investimentos?).{0,45}\b(?:indisponiveis?|ausentes?|nao (?:estao? )?disponiveis?|nao presentes?|nao informados?)\b/,
    /\b(?:dados|conjunto|informacoes?).{0,55}\bnao (?:incluem?|contem|possuem?|trazem?)\b/,
    /\bnao (?:tenho|temos) acesso a.{0,45}\b(?:dados|informacoes?|investimentos?)\b/,
    /\bconjunto de dados.{0,45}\bnao contem\b/,
  ],
  investments: [/\binvestiment(?:o|os|a|ar|ado|ados)?\b/],
  institution: [
    /\binstituicao(?: financeira)?\b/,
    /\bfinancial_institution\b/,
    /\bbanco associado\b/,
    /\bbanco de cada transacao\b/,
  ],
  housing: [/\bhousing\b/, /\bhabitacao\b/, /\bmoradia\b/],
  rent: [/\baluguel\b/],
};

export function containsBenchmarkConcept(
  text: string,
  concept: BenchmarkConcept,
): boolean {
  const normalized = normalizeBenchmarkText(text);
  return conceptPatterns[concept].some((pattern) => pattern.test(normalized));
}

function parseLocaleNumber(raw: string): number | null {
  let value = raw
    .replace(/[\u00a0\u202f\s]/g, "")
    .replace(/^R\$/i, "")
    .trim();

  if (!value || !/[-+]?\d/.test(value)) return null;

  const commaCount = (value.match(/,/g) ?? []).length;
  const dotCount = (value.match(/\./g) ?? []).length;

  if (commaCount > 0 && dotCount > 0) {
    const lastComma = value.lastIndexOf(",");
    const lastDot = value.lastIndexOf(".");
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    value = value.split(thousandsSeparator).join("");
    value = value.replace(decimalSeparator, ".");
  } else if (commaCount > 0 || dotCount > 0) {
    const separator = commaCount > 0 ? "," : ".";
    const parts = value.split(separator);
    const last = parts.at(-1) ?? "";

    if (parts.length > 2) {
      if (last.length === 1 || last.length === 2) {
        value = `${parts.slice(0, -1).join("")}.${last}`;
      } else {
        value = parts.join("");
      }
    } else if (last.length === 3) {
      // 2.845 / 2,845 são muito mais provavelmente separadores de milhar.
      value = parts.join("");
    } else {
      value = `${parts[0]}.${last}`;
    }
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Extrai valores em formatos comuns PT-BR/EN:
 * 2.845,64 | 2 845,64 | 2845.64 | 2,845.64 | 50,37
 */
export function extractBenchmarkNumbers(text: string): number[] {
  const matches = text.match(/[-+]?\d(?:[\d.,\u00a0\u202f ]*\d)?/g) ?? [];
  return matches
    .map(parseLocaleNumber)
    .filter((value): value is number => value !== null);
}

export function containsExpectedNumber(options: {
  answer: string;
  expected: number[];
  tolerance?: number;
}): boolean {
  const actual = extractBenchmarkNumbers(options.answer);
  const tolerance = options.tolerance ?? 0.02;

  return options.expected.some((expected) =>
    actual.some((candidate) => Math.abs(candidate - expected) <= tolerance),
  );
}
