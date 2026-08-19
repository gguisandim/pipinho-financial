const MONTHS: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

const DATE_RANGE_TOOLS = new Set([
  "get_cash_flow",
  "get_spending_summary",
  "get_savings_status",
  "get_income",
  "get_spending_by_category",
  "get_category_transactions",
  "get_largest_expenses",
  "get_spending_by_institution",
  "get_monthly_financial_trend",
]);

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function monthEnd(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function explicitYears(question: string): number[] {
  return [...question.matchAll(/\b(20\d{2})\b/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
}

function namedMonths(question: string): number[] {
  const q = normalizeText(question);
  const output: number[] = [];
  for (const [name, number] of Object.entries(MONTHS)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(q)) output.push(number);
  }
  return output;
}

function asksWholeNamedMonth(question: string): boolean {
  const q = normalizeText(question);
  const months = [...new Set(namedMonths(question))];
  if (months.length !== 1) return false;

  // Se o usuário delimitou dias/partes do mês, preservamos os argumentos para
  // que o guard valide o intervalo específico. Sem esse refinamento, "em julho"
  // significa o mês civil completo.
  if (/\bdia\s+\d{1,2}\b/.test(q)) return false;
  if (/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(q)) return false;
  if (/\b(desde|ate|entre|antes|depois|quinzena|inicio|fim|primeiros?|ultimos?)\b/.test(q)) {
    return false;
  }

  return true;
}

function inferredRange(question: string, referenceDate: string): {
  startDate: string;
  endDate: string;
} | null {
  const years = explicitYears(question);
  const months = namedMonths(question);
  const referenceYear = Number(referenceDate.slice(0, 4));

  // Um mês nomeado sem ano usa o ano da data de referência, regra já adotada
  // pelo guard. Para dois meses no mesmo pedido, cobrimos o intervalo entre eles.
  if (months.length > 0) {
    const year = years.length === 1 ? years[0]! : referenceYear;
    const first = Math.min(...months);
    const last = Math.max(...months);
    return {
      startDate: monthStart(year, first),
      endDate: monthEnd(year, last),
    };
  }

  // Ano explícito sem mês: a pergunta é sobre o ano inteiro.
  if (years.length === 1) {
    const year = years[0]!;
    return {
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
    };
  }

  return null;
}

function parseObject(rawArguments: string): Record<string, unknown> | null {
  try {
    const parsed = rawArguments.trim() ? JSON.parse(rawArguments) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function normalizeFinancialToolArguments(options: {
  question: string;
  name: string;
  rawArguments: string;
  referenceDate: string;
  availablePeriod?: { start: string; end: string } | null;
}): string {
  const parsed = parseObject(options.rawArguments);
  if (!parsed) return options.rawArguments;

  // Null do provider tem semântica de "omitido" nas tools financeiras.
  for (const [key, value] of Object.entries(parsed)) {
    if (value === null) delete parsed[key];
  }

  // Se o modelo apenas copiou a cobertura descoberta em uma pergunta sem
  // período, removemos a data derivada antes do guard de grounding.
  if (
    options.availablePeriod &&
    parsed.startDate === options.availablePeriod.start &&
    parsed.endDate === options.availablePeriod.end
  ) {
    const q = normalizeText(options.question);
    const hasTemporalQuestion =
      namedMonths(q).length > 0 || explicitYears(q).length > 0 ||
      /\b(hoje|ontem|semana|mes|meses|ano|anos|trimestre|semestre|periodo|desde|ate|entre|ultimo|ultimos|ultima|ultimas)\b/.test(q);
    if (!hasTemporalQuestion) {
      delete parsed.startDate;
      delete parsed.endDate;
    }
  }

  if (DATE_RANGE_TOOLS.has(options.name)) {
    const range = inferredRange(options.question, options.referenceDate);
    if (range) {
      // Para um mês civil completo explicitamente pedido ("em julho"), o
      // intervalo é determinístico e não deve depender do provider. Isso evita
      // subcontagem silenciosa caso o modelo gere 02→30 em vez de 01→31.
      if (asksWholeNamedMonth(options.question)) {
        parsed.startDate = range.startDate;
        parsed.endDate = range.endDate;
      } else {
        // Nos demais casos, só preenche o que o provider omitiu.
        if (typeof parsed.startDate !== "string") parsed.startDate = range.startDate;
        if (typeof parsed.endDate !== "string") parsed.endDate = range.endDate;
      }

      // Comparações explícitas entre meses têm um intervalo determinístico na
      // própria pergunta. Para a tool mensal, canonicamos o intervalo completo
      // e o número de pontos para evitar chamadas como junho→agosto quando o
      // usuário perguntou apenas junho versus julho.
      if (options.name === "get_monthly_financial_trend") {
        const months = [...new Set(namedMonths(options.question))];
        if (months.length >= 2) {
          parsed.startDate = range.startDate;
          parsed.endDate = range.endDate;
          parsed.months = months.length;
        }
      }
    }
  }

  if (options.name === "get_spending_by_category") {
    const q = normalizeText(options.question);
    const asksFood = /\b(alimentacao|comida|alimentar)\b/.test(q);
    if (asksFood && parsed.category === undefined && parsed.categoryGroup === undefined) {
      parsed.categoryGroup = "food";
    }
  }

  return JSON.stringify(parsed);
}
