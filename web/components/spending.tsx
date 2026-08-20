"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatDate, formatPercent, labelCategory } from "@/lib/format";
import type { DashboardOverview, DashboardOverviewOk, LargestExpensesResponse } from "@/lib/types";

export function SpendingClient() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [largest, setLargest] = useState<LargestExpensesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/pipinho/overview", { cache: "no-store" }).then(async (r) => ({ ok: r.ok, json: await r.json() })),
      fetch("/api/pipinho/largest?limit=8", { cache: "no-store" }).then(async (r) => ({ ok: r.ok, json: await r.json() })),
    ]).then(([o, l]) => {
      if (!o.ok) throw new Error(o.json?.message ?? "Falha ao carregar gastos.");
      setOverview(o.json);
      if (l.ok) setLargest(l.json);
    }).catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar gastos."));
  }, []);

  if (error) return <div className="center-state"><h1>Não foi possível carregar os gastos.</h1><p>{error}</p></div>;
  if (!overview) return <div className="page-stack"><div className="skeleton skeleton-title"/><div className="dashboard-grid"><div className="skeleton skeleton-panel"/><div className="skeleton skeleton-panel"/></div></div>;
  if (overview.status !== "ok") return <div className="center-state"><h1>Sem gastos para mostrar.</h1><p>{overview.message}</p></div>;

  return <SpendingContent overview={overview} largest={largest} />;
}

function SpendingContent({ overview, largest }: { overview: DashboardOverviewOk; largest: LargestExpensesResponse | null }) {
  return <div className="page-stack">
    <header className="page-header"><div><span className="eyebrow">GASTOS</span><h1>Para onde seu dinheiro está indo.</h1><p>Comparações por categoria e instituição calculadas no backend financeiro.</p></div></header>
    <section className="spending-summary"><div><span>Gasto líquido</span><strong>{formatCurrency(overview.metrics.spending.netSpending)}</strong></div><div><span>Compras no cartão</span><strong>{formatCurrency(overview.metrics.spending.cardPurchases)}</strong></div><div><span>Saídas bancárias classificadas</span><strong>{formatCurrency(overview.metrics.spending.bankSpending)}</strong></div><div><span>Encargos financeiros</span><strong>{formatCurrency(overview.quality.financialChargesAmount)}</strong></div></section>
    <section className="dashboard-grid">
      <article className="panel"><div className="panel-heading"><div><span className="eyebrow">CATEGORIAS</span><h2>Participação nos gastos</h2></div></div><div className="category-list">{overview.categories.map((item) => <div className="category-row" key={item.category}><div className="category-copy"><strong>{labelCategory(item.category)}</strong><span>{formatCurrency(item.amount)}</span></div><div className="category-track"><div className="category-fill" style={{ width: `${Math.min(item.sharePct, 100)}%` }}/></div><small>{formatPercent(item.sharePct)}</small></div>)}</div></article>
      <article className="panel"><div className="panel-heading"><div><span className="eyebrow">INSTITUIÇÕES</span><h2>Origem dos gastos</h2></div></div><div className="institution-list">{overview.institutions.map((item) => <div className="institution-row" key={item.institution}><div><span className="bank-dot">{item.institution.slice(0, 1).toUpperCase()}</span><p><strong>{item.institution}</strong><small>{item.transactionCount} transações</small></p></div><p><strong>{formatCurrency(item.amount)}</strong><small>{formatPercent(item.sharePct)}</small></p></div>)}</div></article>
    </section>
    <article className="panel"><div className="panel-heading"><div><span className="eyebrow">MAIORES MOVIMENTAÇÕES</span><h2>Gastos que mais pesaram</h2></div><span className="small-pill">top 8</span></div><div className="expense-table"><div className="expense-table-head"><span>Descrição</span><span>Categoria</span><span>Instituição</span><span>Data</span><span>Valor</span></div>{largest?.status === "ok" && largest.expenses?.map((expense, index) => <div className="expense-table-row" key={`${expense.date}-${index}`}><span className="expense-description">{expense.description}</span><span>{labelCategory(expense.category)}</span><span>{expense.institution ?? "—"}</span><span>{formatDate(expense.date)}</span><strong>{formatCurrency(expense.amount)}</strong></div>)}</div></article>
  </div>;
}
