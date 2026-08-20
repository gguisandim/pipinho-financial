export const ALL_PERIOD = "all" as const;
export type PeriodValue = typeof ALL_PERIOD | string;

export function currentMonthValue(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(month: string): { startDate: string; endDate: string } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthNumber = Number(monthRaw);
  if (!Number.isInteger(year) || monthNumber < 1 || monthNumber > 12) return null;

  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    startDate: `${yearRaw}-${monthRaw}-01`,
    endDate: `${yearRaw}-${monthRaw}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function previousMonthValue(month: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [yearRaw, monthRaw] = month.split("-");
  const date = new Date(Number(yearRaw), Number(monthRaw) - 2, 1);
  if (Number.isNaN(date.getTime())) return null;
  return currentMonthValue(date);
}

export function periodQuery(period: PeriodValue): string {
  if (period === ALL_PERIOD) return "";
  const range = monthRange(period);
  if (!range) return "";
  const params = new URLSearchParams(range);
  return params.toString();
}

export function periodBody(period: PeriodValue): { startDate?: string; endDate?: string } {
  if (period === ALL_PERIOD) return {};
  return monthRange(period) ?? {};
}
