"use client";

import { useMemo } from "react";
import { ALL_PERIOD, currentMonthValue, type PeriodValue } from "@/lib/period";

function monthLabel(value: string): string {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, 1);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function buildMonths(count = 24): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    return currentMonthValue(date);
  });
}

export function PeriodFilter({ value, onChange, disabled = false }: { value: PeriodValue; onChange: (value: PeriodValue) => void; disabled?: boolean }) {
  const months = useMemo(() => buildMonths(), []);
  const current = currentMonthValue();

  return (
    <label className="period-filter">
      <span>Período</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} aria-label="Selecionar período do dashboard">
        <option value={current}>Este mês · {monthLabel(current)}</option>
        {months.filter((month) => month !== current).map((month, index) => (
          <option value={month} key={month}>{index === 0 ? "Mês passado · " : ""}{monthLabel(month)}</option>
        ))}
        <option value={ALL_PERIOD}>Todo o período disponível</option>
      </select>
    </label>
  );
}
