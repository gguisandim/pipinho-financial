const INSTITUTION_ALIASES: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /\b(nubank|nu bank|nubnak|nubnk|roxinho|no nu|do nu)\b/i, canonical: "Nubank" },
  { pattern: /\b(picpay|pic pay|pic pey)\b/i, canonical: "PicPay" },
  { pattern: /\b(neon|banco neon)\b/i, canonical: "Neon" },
];

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
  "get_recent_transactions",
  "search_transactions",
  "get_daily_spending_summary",
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

function isoFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function addDays(iso: string, days: number): string {
  const date = utcDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return isoFromDate(date);
}

function startOfIsoWeek(iso: string): string {
  const date = utcDate(iso);
  const weekday = date.getUTCDay();
  const delta = weekday === 0 ? -6 : 1 - weekday;
  return addDays(iso, delta);
}

function inferInstitution(question: string): string | null {
  const normalized = normalizeText(question);
  for (const alias of INSTITUTION_ALIASES) {
    if (alias.pattern.test(normalized)) return alias.canonical;
  }
  return null;
}

function hasTemporalReference(question: string): boolean {
  const q = normalizeText(question);
  return (
    namedMonths(q).length > 0 ||
    explicitYears(q).length > 0 ||
    /\b(hoje|ontem|anteontem|semana|mes|meses|ano|anos|trimestre|semestre|periodo|desde|ate|entre|ultimo|ultimos|ultima|ultimas)\b/.test(q)
  );
}

function recentDaysRange(referenceDate: string, days: number): { startDate: string; endDate: string } {
  return { startDate: addDays(referenceDate, -(days - 1)), endDate: referenceDate };
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

  if (/\bdia\s+\d{1,2}\b/.test(q)) return false;
  if (/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(q)) return false;
  if (/\b(desde|ate|entre|antes|depois|quinzena|inicio|fim|primeiros?|ultimos?)\b/.test(q)) {
    return false;
  }

  return true;
}

function relativeRange(question: string, referenceDate: string): {
  startDate: string;
  endDate: string;
} | null {
  const q = normalizeText(question);
  const referenceYear = Number(referenceDate.slice(0, 4));
  const referenceMonth = Number(referenceDate.slice(5, 7));

  // Ordem importa: expressões mais específicas vêm antes das genéricas.
  if (/\b(anteontem)\b/.test(q)) {
    const day = addDays(referenceDate, -2);
    return { startDate: day, endDate: day };
  }

  if (/\b(ontem)\b/.test(q)) {
    const day = addDays(referenceDate, -1);
    return { startDate: day, endDate: day };
  }

  if (/\b(hoje)\b/.test(q)) {
    return { startDate: referenceDate, endDate: referenceDate };
  }

  if (/\b(mes passado|ultimo mes|mes anterior)\b/.test(q)) {
    const previous = new Date(Date.UTC(referenceYear, referenceMonth - 2, 1));
    const year = previous.getUTCFullYear();
    const month = previous.getUTCMonth() + 1;
    return { startDate: monthStart(year, month), endDate: monthEnd(year, month) };
  }

  if (/\b(este mes|esse mes|nesse mes|neste mes|mes atual)\b/.test(q)) {
    return {
      startDate: monthStart(referenceYear, referenceMonth),
      endDate: referenceDate,
    };
  }

  if (/\b(semana passada|ultima semana|semana anterior)\b/.test(q)) {
    const thisMonday = startOfIsoWeek(referenceDate);
    const previousMonday = addDays(thisMonday, -7);
    return { startDate: previousMonday, endDate: addDays(previousMonday, 6) };
  }

  if (/\b(esta semana|essa semana|nessa semana|nesta semana|semana atual)\b/.test(q)) {
    return { startDate: startOfIsoWeek(referenceDate), endDate: referenceDate };
  }

  const lastDays = /\b(?:ultimos?|ultimas?)\s+(\d{1,3})\s+dias?\b/.exec(q);
  if (lastDays?.[1]) {
    const days = Math.min(Math.max(Number(lastDays[1]), 1), 366);
    return {
      startDate: addDays(referenceDate, -(days - 1)),
      endDate: referenceDate,
    };
  }

  return null;
}

function inferredRange(question: string, referenceDate: string): {
  startDate: string;
  endDate: string;
} | null {
  const relative = relativeRange(question, referenceDate);
  if (relative) return relative;

  const years = explicitYears(question);
  const months = namedMonths(question);
  const referenceYear = Number(referenceDate.slice(0, 4));

  if (months.length > 0) {
    const year = years.length === 1 ? years[0]! : referenceYear;
    const first = Math.min(...months);
    const last = Math.max(...months);
    return {
      startDate: monthStart(year, first),
      endDate: monthEnd(year, last),
    };
  }

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

  for (const [key, value] of Object.entries(parsed)) {
    if (value === null) delete parsed[key];
  }

  if (
    options.availablePeriod &&
    parsed.startDate === options.availablePeriod.start &&
    parsed.endDate === options.availablePeriod.end
  ) {
    const hasTemporalQuestion = hasTemporalReference(options.question);
    if (!hasTemporalQuestion) {
      delete parsed.startDate;
      delete parsed.endDate;
    }
  }

  if (DATE_RANGE_TOOLS.has(options.name)) {
    const normalizedQuestion = normalizeText(options.question);
    const dailyBaselineComparison =
      options.name === "get_daily_spending_summary" &&
      /\b(gastei muito|gastei acima|gastei mais que o normal|fora do normal|acima do normal)\b/.test(
        normalizedQuestion,
      );
    const asksHabitualDailySpending =
      options.name === "get_daily_spending_summary" &&
      /\b(costumo|media|padrao|normal|por dia)\b/.test(normalizedQuestion);
    const explicitRange = inferredRange(options.question, options.referenceDate);
    const range = dailyBaselineComparison
      ? recentDaysRange(options.referenceDate, 90)
      : explicitRange ??
        (asksHabitualDailySpending && !hasTemporalReference(options.question)
          ? recentDaysRange(options.referenceDate, 90)
          : null);
    if (range) {
      if (asksWholeNamedMonth(options.question)) {
        parsed.startDate = range.startDate;
        parsed.endDate = range.endDate;
      } else {
        if (typeof parsed.startDate !== "string") parsed.startDate = range.startDate;
        if (typeof parsed.endDate !== "string") parsed.endDate = range.endDate;
      }

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

  if (
    options.name === "get_spending_by_institution" ||
    options.name === "get_account_balances"
  ) {
    const institution = inferInstitution(options.question);
    if (institution && parsed.institution === undefined) parsed.institution = institution;
  }

  if (options.name === "search_transactions") {
    const q = normalizeText(options.question);
    if (parsed.kind === undefined && /\b(gasto|gastos|compra|compras|despesa|despesas|paguei|custou)\b/.test(q)) {
      parsed.kind = "spending";
    }
  }

  if (options.name === "get_recent_transactions") {
    const q = normalizeText(options.question);
    if (parsed.kind === undefined) {
      if (/\b(gasto|gastos|compra|compras|despesa|despesas|comprei|paguei)\b/.test(q)) {
        parsed.kind = "spending";
      } else if (/\b(recebi|renda|salario|entrada|entradas)\b/.test(q)) {
        parsed.kind = "income";
      }
    }

    if (parsed.limit === undefined && /\b(ultimo gasto|ultima compra|ultima transacao|ultima movimentacao)\b/.test(q)) {
      parsed.limit = 1;
    }
  }

  return JSON.stringify(parsed);
}
