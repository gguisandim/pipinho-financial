import type { AgentToolTrace } from "./financial-agent.types.js";

export type CausalGroundingViolationCode =
  | "unsupported_generalization"
  | "unsupported_detail"
  | "unsupported_event_causality";

export interface CausalGroundingViolation {
  code: CausalGroundingViolationCode;
  sentence: string;
  detail?: string;
}

export interface CausalGroundingEvaluation {
  passed: boolean;
  violations: CausalGroundingViolation[];
}

const generalizationPatterns = [
  /\b(costuma|costumam|geralmente|normalmente|tipicamente|em geral)\b/i,
  /\b(provavelmente|possivelmente|talvez|pode indicar|poderia indicar)\b/i,
];


const eventCausalityPatterns = [
  /\b(por causa|devido a|em razao|causad[oa]s?|gerou|provocou)\b/i,
  /\b(gast(?:ei|ou|os?)|despes(?:a|as))\b.*\b(na|no|durante a|durante o)\s+(reuniao|evento|compromisso|aula|consulta)\b/i,
  /\b(gastos?|despesas?)\b.*\b(relacionad[oa]s?|associad[oa]s?)\s+(ao|a)\s+(evento|compromisso|reuniao|aula|consulta)\b/i,
];

function usedEventDaySpending(tools: AgentToolTrace[]): boolean {
  return tools.some(
    (tool) => tool.outcome === "executed" && tool.name === "get_event_day_spending",
  );
}

// Detalhes que o modelo costuma inferir a partir de categorias agregadas.
// Eles só podem aparecer como fatos se também estiverem presentes nos resultados
// das tools executadas naquele turno.
const detailTerms = [
  "aluguel",
  "condomínio",
  "manutenção",
  "hipoteca",
  "financiamento",
  "prestação",
];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function evidenceText(tools: AgentToolTrace[]): string {
  return normalize(JSON.stringify(tools.map((tool) => tool.result)));
}

export function evaluateCausalGrounding(
  answer: string,
  tools: AgentToolTrace[],
): CausalGroundingEvaluation {
  const evidence = evidenceText(tools);
  const violations: CausalGroundingViolation[] = [];

  const eventWindowOnly = usedEventDaySpending(tools);

  for (const sentence of splitSentences(answer)) {
    if (eventWindowOnly && eventCausalityPatterns.some((pattern) => pattern.test(normalize(sentence)))) {
      violations.push({
        code: "unsupported_event_causality",
        sentence,
        detail:
          "A tool de rotina comprova apenas coincidência temporal entre o compromisso e a janela de gastos, não causalidade.",
      });
    }

    for (const pattern of generalizationPatterns) {
      if (pattern.test(sentence)) {
        violations.push({
          code: "unsupported_generalization",
          sentence,
          detail:
            "A resposta introduziu uma generalização ou hipótese externa aos resultados das ferramentas.",
        });
        break;
      }
    }

    const normalizedSentence = normalize(sentence);
    for (const rawTerm of detailTerms) {
      const term = normalize(rawTerm);
      if (normalizedSentence.includes(term) && !evidence.includes(term)) {
        violations.push({
          code: "unsupported_detail",
          sentence,
          detail: `O detalhe \"${rawTerm}\" não aparece nos resultados das ferramentas executadas.`,
        });
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

export function sanitizeCausalGrounding(
  answer: string,
  violations: CausalGroundingViolation[],
): string {
  if (violations.length === 0) return answer;

  const offendingSentences = new Set(violations.map((violation) => violation.sentence));
  const safe = splitSentences(answer).filter(
    (sentence) => !offendingSentences.has(sentence),
  );

  const suffix =
    "Os dados disponíveis permitem descrever valores, proporções e a composição observada, mas não permitem atribuir causas comportamentais sem evidência adicional.";

  return [...safe, suffix].join("\n\n").trim();
}
