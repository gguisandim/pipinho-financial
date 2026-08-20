"use client";

import { useEffect, useState } from "react";
import { PeriodFilter } from "./period-filter";
import { formatCurrency, formatDate, formatPercent, labelCategory } from "@/lib/format";
import { currentMonthValue, periodQuery, type PeriodValue } from "@/lib/period";
import type { DashboardOverview, DashboardOverviewOk, LargestExpensesResponse } from "@/lib/types";

export function SpendingClient() {
  const [period, setPeriod] = useState<PeriodValue>(() => currentMonthValue());
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [largest, setLargest] = useState<LargestExpensesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const hasData = overview !== null;
      try {
        setError(null);
        if (hasData) setRefreshing(true);
        else setLoading(true);

        const query = periodQuery(period);
        const overviewUrl = `/api/pipinho/overview${query ? `?${query}` : ""}`;
        const largestUrl = `/api/pipinho/largest?limit=8${query ? `&${query}` : ""}`;
        const [overviewResponse, largestResponse] = await Promise.all([
          fetch(overviewUrl, { cache: "no-store" }),
          fetch(largestUrl, { cache: "no-store" }),
        ]);
        const overviewJson = await overviewResponse.json() as DashboardOverview & { message?: string };
        const largestJson = await largestResponse.json() as LargestExpensesResponse;
        if (!overviewResponse.ok) throw new Error(overviewJson?.message ?? "Falha ao carregar gastos.");
        if (!cancelled) {
          setOverview(overviewJson);
          setLargest(largestResponse.ok ? largestJson : null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar gastos.");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [period]);

  if (loading) return <div className="page-stack"><div className="skeleton skeleton-title"/><div className="spending-summary"><div className="skeleton skeleton-card"/><div className="skeleton skeleton-card"/><div className="skeleton skeleton-card"/><div className="skeleton skeleton-card"/></div><div className="dashboard-grid"><div className="skeleton skeleton-panel"/><div className="skeleton skeleton-panel"/></div></div>;
  if (error && !overview) return <div className="center-state"><h1>Não foi possível carregar os gastos.</h1><p>{error}</p></div>;

  return <div className={`page-stack ${refreshing ? "page-refreshing" : ""}`}>
    <header className="page-header">
      <div><span className="eyebrow">GASTOS</span><h1>Para onde seu dinheiro está indo.</h1><p>Filtre por mês para evitar que o histórico inteiro seja somado em uma única visão.</p></div>
      <div className="page-header-actions"><PeriodFilter value={period} onChange={setPeriod} disabled={refreshing} /></div>
    </header>
    {error ? <div className="inline-warning">A atualização mais recente falhou: {error}</div> : null}
    {overview?.status === "ok" ? <SpendingContent overview={overview} largest={largest} /> : <div className="center-state no-data-panel"><span className="eyebrow">SEM GASTOS NESTE PERÍODO</span><h1>Nada para somar neste mês.</h1><p>{overview?.message ?? "Selecione outro mês ou todo o período disponível."}</p></div>}
  </div>;
}

function SpendingContent({ overview, largest }: { overview: DashboardOverviewOk; largest: LargestExpensesResponse | null }) {
  return <>
    <div className="period-summary-line"><span>{overview.dataset.selectedPeriod.start}</span><i>→</i><span>{overview.dataset.selectedPeriod.end}</span><strong>{overview.dataset.transactionCount} transações analisadas</strong></div>
    <section className="spending-summary"><div><span>Gasto líquido</span><strong>{formatCurrency(overview.metrics.spending.netSpending)}</strong></div><div><span>Compras no cartão</span><strong>{formatCurrency(overview.metrics.spending.cardPurchases)}</strong></div><div><span>Saídas bancárias classificadas</span><strong>{formatCurrency(overview.metrics.spending.bankSpending)}</strong></div><div><span>Encargos financeiros</span><strong>{formatCurrency(overview.quality.financialChargesAmount)}</strong></div></section>
    <section className="dashboard-grid">
      <article className="panel"><div className="panel-heading"><div><span className="eyebrow">CATEGORIAS</span><h2>Participação nos gastos</h2></div></div><div className="category-list">{overview.categories.length ? overview.categories.map((item) => <div className="category-row" key={item.category}><div className="category-copy"><strong>{labelCategory(item.category)}</strong><span>{formatCurrency(item.amount)}</span></div><div className="category-track"><div className="category-fill" style={{ width: `${Math.min(item.sharePct, 100)}%` }}/></div><small>{formatPercent(item.sharePct)}</small></div>) : <p className="muted">Sem categorias neste período.</p>}</div></article>
      <article className="panel"><div className="panel-heading"><div><span className="eyebrow">INSTITUIÇÕES</span><h2>Origem dos gastos</h2></div></div><div className="institution-list">{overview.institutions.length ? overview.institutions.map((item) => <div className="institution-row" key={item.institution}><div><span className="bank-dot">{item.institution.slice(0, 1).toUpperCase()}</span><p><strong>{item.institution}</strong><small>{item.transactionCount} transações</small></p></div><p><strong>{formatCurrency(item.amount)}</strong><small>{formatPercent(item.sharePct)}</small></p></div>) : <p className="muted">Sem instituições com gastos neste período.</p>}</div></article>
    </section>
    <article className="panel"><div className="panel-heading"><div><span className="eyebrow">MAIORES MOVIMENTAÇÕES</span><h2>Gastos que mais pesaram</h2></div><span className="small-pill">top 8 do período</span></div><div className="expense-table"><div className="expense-table-head"><span>Descrição</span><span>Categoria</span><span>Instituição</span><span>Data</span><span>Valor</span></div>{largest?.status === "ok" && largest.expenses?.length ? largest.expenses.map((expense, index) => <div className="expense-table-row" key={`${expense.date}-${index}`}><span className="expense-description" data-label="Descrição">{expense.description}</span><span data-label="Categoria">{labelCategory(expense.category)}</span><span data-label="Instituição">{expense.institution ?? "—"}</span><span data-label="Data">{formatDate(expense.date)}</span><strong data-label="Valor">{formatCurrency(expense.amount)}</strong></div>) : <p className="muted expense-empty">Sem movimentações relevantes neste período.</p>}</div></article>
  </>;
}
