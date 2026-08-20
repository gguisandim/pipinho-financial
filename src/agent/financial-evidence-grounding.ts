import type { AgentToolTrace } from "./financial-agent.types.js";

export type FinancialEvidenceViolationCode =
  | "unsupported_numeric_claim"
  | "unsupported_category_breakdown"
  | "unsupported_institution_breakdown"
  | "unsupported_monthly_breakdown";

export interface FinancialEvidenceViolation {
  code: FinancialEvidenceViolationCode;
  fragment: string;
  detail: string;
}

export interface FinancialEvidenceGroundingEvaluation {
  passed: boolean;
  violations: FinancialEvidenceViolation[];
}

interface NumericClaim {
  kind: "currency" | "percent";
  raw: string;
  value: number;
  decimalPlaces: number;
}

interface NumericEvidence {
  kind: "currency" | "percent" | "other";
  value: number;
  key: string | null;
}

function executedTools(tools: AgentToolTrace[]): AgentToolTrace[] {
  return tools.filter((tool) => tool.outcome === "executed");
}

function inferNumericEvidenceKind(key: string | null): NumericEvidence["kind"] {
  if (!key) return "other";
  const normalized = key.toLowerCase();

  if (/(pct|percent|percentage|rate)/.test(normalized)) return "percent";
  if (/(count|pages?|months?|transactions?|iterations?|tokens?|latency|limit)/.test(normalized)) {
    return "other";
  }
  if (
    /(amount|spending|income|inflow|outflow|cashflow|cash_flow|savings|refund|purchase|expense|balance|total)/.test(
      normalized,
    )
  ) {
    return "currency";
  }

  return "other";
}

function collectNumericEvidence(
  value: unknown,
  output: NumericEvidence[],
  key: string | null = null,
): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    output.push({ value, kind: inferNumericEvidenceKind(key), key });
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectNumericEvidence(item, output, key);
    return;
  }

  if (value && typeof value === "object") {
    for (const [childKey, item] of Object.entries(value as Record<string, unknown>)) {
      collectNumericEvidence(item, output, childKey);
    }
  }
}

function normalizeNumberText(raw: string): number | null {
  let value = raw
    .replace(/[−–—]/g, "-")
    .replace(/[\u00a0\u202f\s]/g, "")
    .trim();

  if (!value) return null;

  if (value.includes(",")) {
    value = value.replace(/\./g, "").replace(",", ".");
  } else {
    const dotMatches = value.match(/\./g)?.length ?? 0;
    if (dotMatches > 1) {
      value = value.replace(/\./g, "");
    } else if (dotMatches === 1 && /\.\d{3}$/.test(value)) {
      // Em pt-BR, 1.200 costuma ser separador de milhar.
      value = value.replace(".", "");
    }
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function claimDecimalPlaces(rawNumber: string): number {
  const compact = rawNumber
    .replace(/[−–—]/g, "-")
    .replace(/[\u00a0\u202f\s]/g, "")
    .trim();

  const comma = compact.lastIndexOf(",");
  if (comma >= 0) return Math.max(0, compact.length - comma - 1);

  // Em respostas pt-BR um ponto isolado seguido de três dígitos costuma ser
  // separador de milhar. Só tratamos ponto com 1–2 dígitos finais como casa
  // decimal.
  const dot = compact.lastIndexOf(".");
  if (dot >= 0) {
    const tail = compact.slice(dot + 1);
    if (/^\d{1,2}$/.test(tail)) return tail.length;
  }

  return 0;
}

function extractNumericClaims(text: string): NumericClaim[] {
  const claims: NumericClaim[] = [];
  const seen = new Set<string>();

  const patterns: Array<{ kind: NumericClaim["kind"]; regex: RegExp; group: number }> = [
    {
      kind: "currency",
      regex: /R\$\s*([−–—-]?\s*\d[\d.\u00a0\u202f \t]*(?:,\d{1,2})?)/gi,
      group: 1,
    },
    {
      kind: "currency",
      regex: /([−–—-]?\s*\d[\d.\u00a0\u202f \t]*(?:,\d{1,2})?)\s*R\$/gi,
      group: 1,
    },
    {
      kind: "percent",
      regex: /([−–—-]?\s*\d[\d.\u00a0\u202f \t]*(?:,\d+)?)\s*%/gi,
      group: 1,
    },
  ];

  for (const { kind, regex, group } of patterns) {
    for (const match of text.matchAll(regex)) {
      const raw = match[0];
      if (!raw || seen.has(`${kind}:${raw}`)) continue;
      const value = normalizeNumberText(match[group] ?? "");
      if (value === null) continue;
      seen.add(`${kind}:${raw}`);
      claims.push({
        kind,
        raw,
        value,
        decimalPlaces: claimDecimalPlaces(match[group] ?? ""),
      });
    }
  }

  return claims;
}

function supportedNumericClaim(
  claim: NumericClaim,
  evidence: NumericEvidence[],
): boolean {
  // Se o modelo exibe um agregado arredondado sem casas decimais, aceitar a
  // diferença natural do arredondamento não significa aceitar um número
  // inventado. Com centavos/decimais explícitos mantemos tolerância estrita.
  const tolerance =
    claim.decimalPlaces === 0
      ? 0.51
      : claim.decimalPlaces === 1
        ? 0.051
        : claim.kind === "percent"
          ? 0.011
          : 0.02;
  return evidence.some(
    (item) =>
      item.kind === claim.kind && Math.abs(item.value - claim.value) <= tolerance,
  );
}

function hasAnyTool(names: Set<string>, candidates: string[]): boolean {
  return candidates.some((name) => names.has(name));
}

const categoryTerms =
  /\b(housing|groceries|food\s*delivery|transport|utilities|subscriptions|health|restaurants?|education|fitness|shopping|financial[_\s-]?charges|other|moradia|mercado|transporte|assinaturas?|sa[uú]de|restaurantes?|educa[cç][aã]o|encargos?\s+financeiros?)\b/i;

const institutionTerms = /\b(nubank|neon|picpay|institui[cç][aã]o|banco)\b/i;

// Uma referência a um único mês (ex.: "Em julho gastei R$ 816,37") pode ser
// sustentada por qualquer tool agregada com startDate/endDate daquele mês. O
// guard mensal existe para impedir séries/comparações inventadas, não para
// obrigar get_monthly_financial_trend em toda pergunta que mencione um mês.
const monthNames = [
  "janeiro",
  "fevereiro",
  "março",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const monthlyTrendTerms =
  /\b(mensal|m[eê]s\s+a\s+m[eê]s|evolu[cç][aã]o(?:\s+mensal)?|tend[eê]ncia(?:\s+mensal)?|compar(?:ar|a[cç][aã]o)\s+(?:entre\s+)?m[eê]ses?)\b/i;

function distinctMonthReferences(line: string): number {
  const normalized = line
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const refs = new Set<string>();
  const normalizedNames = [...new Set(monthNames.map((name) =>
    name.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
  ))];

  for (const name of normalizedNames) {
    if (new RegExp(`\\b${name}\\b`, "i").test(normalized)) refs.add(`name:${name}`);
  }

  for (const match of normalized.matchAll(/\b(20\d{2}-\d{2})\b/g)) {
    if (match[1]) refs.add(`iso:${match[1]}`);
  }

  return refs.size;
}

function lineNeedsMonthlySeriesEvidence(line: string): boolean {
  return monthlyTrendTerms.test(line) || distinctMonthReferences(line) >= 2;
}

function lineHasFinancialNumber(line: string): boolean {
  return extractNumericClaims(line).length > 0;
}

export function evaluateFinancialEvidenceGrounding(
  answer: string,
  tools: AgentToolTrace[],
): FinancialEvidenceGroundingEvaluation {
  const violations: FinancialEvidenceViolation[] = [];
  const executed = executedTools(tools);
  const names = new Set(executed.map((tool) => tool.name));
  const evidenceNumbers: NumericEvidence[] = [];
  for (const tool of executed) collectNumericEvidence(tool.result, evidenceNumbers);

  for (const claim of extractNumericClaims(answer)) {
    if (!supportedNumericClaim(claim, evidenceNumbers)) {
      violations.push({
        code: "unsupported_numeric_claim",
        fragment: claim.raw,
        detail: `O valor ${claim.raw} não aparece em nenhum resultado de tool executada nesta resposta.`,
      });
    }
  }

  const categoryEvidence = hasAnyTool(names, [
    "get_spending_by_category",
    "get_category_transactions",
    "get_largest_expenses",
    "get_recent_transactions",
    "search_transactions",
  ]);
  const institutionEvidence = hasAnyTool(names, [
    "get_spending_by_institution",
    "get_category_transactions",
    "get_largest_expenses",
    "get_recent_transactions",
    "search_transactions",
  ]);
  const monthlyEvidence = names.has("get_monthly_financial_trend");

  for (const line of answer.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    const isHeading = /^#{1,6}\s+/.test(line);

    if (
      !categoryEvidence &&
      ((isHeading && /categor(?:ia|ias)/i.test(line)) ||
        (categoryTerms.test(line) && lineHasFinancialNumber(line)))
    ) {
      violations.push({
        code: "unsupported_category_breakdown",
        fragment: line,
        detail:
          "A resposta apresentou decomposição por categoria sem executar uma tool que forneça categorias.",
      });
    }

    if (
      !institutionEvidence &&
      institutionTerms.test(line) &&
      lineHasFinancialNumber(line)
    ) {
      violations.push({
        code: "unsupported_institution_breakdown",
        fragment: line,
        detail:
          "A resposta apresentou valor por instituição sem uma tool que forneça evidência de instituição nesta execução.",
      });
    }

    if (
      !monthlyEvidence &&
      ((isHeading && monthlyTrendTerms.test(line)) ||
        (lineNeedsMonthlySeriesEvidence(line) && lineHasFinancialNumber(line)))
    ) {
      violations.push({
        code: "unsupported_monthly_breakdown",
        fragment: line,
        detail:
          "A resposta apresentou série, tendência ou comparação entre meses sem executar get_monthly_financial_trend.",
      });
    }
  }

  const deduped = new Map<string, FinancialEvidenceViolation>();
  for (const violation of violations) {
    deduped.set(`${violation.code}:${violation.fragment}`, violation);
  }

  return {
    passed: deduped.size === 0,
    violations: [...deduped.values()],
  };
}

function removeUnsupportedSection(
  lines: string[],
  predicate: (heading: string) => boolean,
): string[] {
  const output: string[] = [];
  let skipping = false;
  let skippedHeadingLevel = 7;

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (match) {
      const level = match[1]!.length;
      const heading = match[2]!;

      if (skipping && level <= skippedHeadingLevel) {
        skipping = false;
        skippedHeadingLevel = 7;
      }

      if (!skipping && predicate(heading)) {
        skipping = true;
        skippedHeadingLevel = level;
        continue;
      }
    }

    if (!skipping) output.push(line);
  }

  return output;
}

export function sanitizeFinancialEvidenceGrounding(
  answer: string,
  tools: AgentToolTrace[],
  violations: FinancialEvidenceViolation[],
): string {
  if (violations.length === 0) return answer;

  const names = new Set(executedTools(tools).map((tool) => tool.name));
  let lines = answer.split(/\r?\n/);

  if (
    !hasAnyTool(names, [
      "get_spending_by_category",
      "get_category_transactions",
      "get_largest_expenses",
      "get_recent_transactions",
      "search_transactions",
    ]) &&
    violations.some((violation) => violation.code === "unsupported_category_breakdown")
  ) {
    lines = removeUnsupportedSection(lines, (heading) => /categor(?:ia|ias)/i.test(heading));
  }

  if (
    !hasAnyTool(names, [
      "get_spending_by_institution",
      "get_category_transactions",
      "get_largest_expenses",
      "get_recent_transactions",
      "search_transactions",
    ]) &&
    violations.some((violation) => violation.code === "unsupported_institution_breakdown")
  ) {
    lines = removeUnsupportedSection(lines, (heading) => /institui[cç][aã]o|banco/i.test(heading));
  }

  if (
    !names.has("get_monthly_financial_trend") &&
    violations.some((violation) => violation.code === "unsupported_monthly_breakdown")
  ) {
    lines = removeUnsupportedSection(lines, (heading) =>
      /(mensal|m[eê]s|tend[eê]ncia|evolu[cç][aã]o)/i.test(heading),
    );
  }

  // Se a resposta inventou uma dimensão (categoria/instituição/série mensal)
  // usando por coincidência um número que também existe em outra métrica da
  // tool, o filtro numérico sozinho não remove a linha. Removemos também os
  // fragmentos dimensionais explicitamente marcados pelo evaluator.
  const unsupportedDimensionFragments = new Set(
    violations
      .filter((violation) => violation.code !== "unsupported_numeric_claim")
      .map((violation) => violation.fragment.trim())
      .filter(Boolean),
  );

  if (unsupportedDimensionFragments.size > 0) {
    lines = lines.filter(
      (line) => !unsupportedDimensionFragments.has(line.trim()),
    );
  }

  const unsupportedNumericFragments = new Set(
    violations
      .filter((violation) => violation.code === "unsupported_numeric_claim")
      .map((violation) => violation.fragment),
  );

  if (unsupportedNumericFragments.size > 0) {
    lines = lines.filter(
      (line) => ![...unsupportedNumericFragments].some((fragment) => line.includes(fragment)),
    );
  }

  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
