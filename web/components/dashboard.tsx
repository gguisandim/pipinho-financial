"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, ShieldIcon, SparkleIcon } from "./icons";
import { PeriodFilter } from "./period-filter";
import { formatCurrency, formatMonth, formatPercent, labelCategory } from "@/lib/format";
import { ALL_PERIOD, currentMonthValue, periodBody, periodQuery, previousMonthValue, type PeriodValue } from "@/lib/period";
import type { DashboardInsights, DashboardOverview, DashboardOverviewOk, MonthlyPoint, MonthlySeriesResponse } from "@/lib/types";

function MetricCard({ label, value, note, comparison, tone = "neutral", icon }: { label: string; value: string; note: string; comparison?: string | null; tone?: "positive" | "negative" | "neutral" | "soft"; icon?: React.ReactNode }) {
  return <article className={`metric-card metric-${tone}`}>
    <div className="metric-label-row"><span>{label}</span>{icon}</div>
    <strong>{value}</strong>
    <small>{note}</small>
    {comparison ? <small className="metric-comparison">{comparison}</small> : null}
  </article>;
}

function TrendChart({ points }: { points: MonthlyPoint[] }) {
  const data = points.slice(-8);
  const width = 760;
  const height = 220;
  const pad = 24;
  const max = Math.max(1, ...data.flatMap((p) => [p.spending.netSpending, p.liquidity.bankInflows]));
  const x = (index: number) => pad + (index * (width - pad * 2)) / Math.max(1, data.length - 1);
  const y = (value: number) => height - pad - (value / max) * (height - pad * 2);
  const spending = data.map((p, i) => `${x(i)},${y(p.spending.netSpending)}`).join(" ");
  const inflows = data.map((p, i) => `${x(i)},${y(p.liquidity.bankInflows)}`).join(" ");

  if (!data.length) return <div className="empty-chart">Sem série mensal disponível.</div>;

  return <div className="trend-chart-wrap">
    <div className="trend-chart-scroll">
      <div className="trend-chart-scroll-content">
        <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolução mensal de entradas e gastos">
          <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="chart-axis" />
          <polyline points={inflows} className="chart-line chart-inflow" />
          <polyline points={spending} className="chart-line chart-spending" />
          {data.map((p, i) => <g key={p.month}><circle cx={x(i)} cy={y(p.liquidity.bankInflows)} r="4" className="chart-dot inflow"/><circle cx={x(i)} cy={y(p.spending.netSpending)} r="4" className="chart-dot spending"/></g>)}
        </svg>
        <div className="chart-labels">{data.map((p) => <span key={p.month}>{formatMonth(p.month)}</span>)}</div>
      </div>
    </div>
    <div className="chart-legend"><span><i className="legend-inflow"/> Entradas bancárias</span><span><i className="legend-spending"/> Gastos líquidos</span></div>
  </div>;
}

function CategoryBars({ overview }: { overview: DashboardOverviewOk }) {
  const categories = overview.categories.slice(0, 6);
  return <div className="category-list">
    {categories.length ? categories.map((item) => <div className="category-row" key={item.category}>
      <div className="category-copy"><strong>{labelCategory(item.category)}</strong><span>{formatCurrency(item.amount)}</span></div>
      <div className="category-track"><div className="category-fill" style={{ width: `${Math.min(item.sharePct, 100)}%` }} /></div>
      <small>{formatPercent(item.sharePct)}</small>
    </div>) : <p className="muted">Nenhuma categoria disponível.</p>}
  </div>;
}

function QualityBadge({ overview }: { overview: DashboardOverviewOk }) {
  const q = overview.metrics.income.quality;
  const label = q === "reliable" ? "boa cobertura" : q === "partial" ? "cobertura parcial" : "dados insuficientes";
  return <span className={`quality-badge quality-${q}`}>{label}</span>;
}

function percentageComparison(current: number, previous: number, inverse = false): string | null {
  if (!Number.isFinite(previous) || Math.abs(previous) < 0.01) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(pct) < 0.1) return "praticamente igual ao mês anterior";
  const direction = pct > 0 ? "maior" : "menor";
  const signal = inverse ? (pct > 0 ? "↑" : "↓") : (pct > 0 ? "↑" : "↓");
  return `${signal} ${formatPercent(Math.abs(pct))} ${direction} que o mês anterior`;
}

function pointsComparison(current: number | null, previous: number | null): string | null {
  if (current === null || previous === null) return null;
  const delta = current - previous;
  if (Math.abs(delta) < 0.1) return "taxa estável vs. mês anterior";
  return `${delta > 0 ? "+" : ""}${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(delta)} p.p. vs. mês anterior`;
}

function selectedPeriodLabel(overview: DashboardOverviewOk): string {
  return `${overview.dataset.selectedPeriod.start} → ${overview.dataset.selectedPeriod.end}`;
}

async function responseJson<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

export function DashboardClient() {
  const [period, setPeriod] = useState<PeriodValue>(() => currentMonthValue());
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [previousOverview, setPreviousOverview] = useState<DashboardOverviewOk | null>(null);
  const [monthly, setMonthly] = useState<MonthlyPoint[]>([]);
  const [insights, setInsights] = useState<DashboardInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/pipinho/monthly?months=12", { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, data: await responseJson<MonthlySeriesResponse>(response) }))
      .then(({ ok, data }) => {
        if (!cancelled && ok && data.status === "ok") setMonthly(data.points ?? []);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const hasExistingData = overview !== null;
      try {
        setError(null);
        if (hasExistingData) setRefreshing(true);
        else setLoading(true);

        const query = periodQuery(period);
        const overviewUrl = `/api/pipinho/overview${query ? `?${query}` : ""}`;
        const previousMonth = period === ALL_PERIOD ? null : previousMonthValue(period);
        const previousQuery = previousMonth ? periodQuery(previousMonth) : "";

        const [overviewResponse, insightResponse, previousResponse] = await Promise.all([
          fetch(overviewUrl, { cache: "no-store" }),
          fetch("/api/pipinho/insights", {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...periodBody(period), months: 12, maxCards: 4 }),
          }),
          previousQuery ? fetch(`/api/pipinho/overview?${previousQuery}`, { cache: "no-store" }) : Promise.resolve(null),
        ]);

        const overviewJson = await responseJson<DashboardOverview & { message?: string }>(overviewResponse);
        const insightJson = await responseJson<DashboardInsights>(insightResponse);
        if (!overviewResponse.ok) throw new Error(overviewJson?.message ?? "Não foi possível carregar o dashboard.");

        let previousJson: DashboardOverview | null = null;
        if (previousResponse?.ok) previousJson = await responseJson<DashboardOverview>(previousResponse);

        if (!cancelled) {
          setOverview(overviewJson);
          setInsights(insightResponse.ok ? insightJson : null);
          setPreviousOverview(previousJson?.status === "ok" ? previousJson : null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar dados.");
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

  const todayGreeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  }, []);

  if (loading) return <DashboardSkeleton />;
  if (error && !overview) return <ErrorState message={error} />;

  if (!overview || overview.status !== "ok") {
    return <div className="page-stack">
      <header className="page-header dashboard-header">
        <div><span className="eyebrow">VISÃO GERAL</span><h1>{todayGreeting}. Seu dinheiro está aqui.</h1><p>Selecione outro mês para consultar o histórico disponível.</p></div>
        <div className="page-header-actions"><PeriodFilter value={period} onChange={setPeriod} disabled={refreshing} /></div>
      </header>
      <NoDataState message={overview?.message} />
    </div>;
  }

  const savingsAvailable = overview.metrics.savings.available;
  const cashPositive = overview.metrics.liquidity.netBankCashFlow >= 0;
  const previous = previousOverview;
  const spendingComparison = previous ? percentageComparison(overview.metrics.spending.netSpending, previous.metrics.spending.netSpending, true) : null;
  const cashComparison = previous ? `${formatCurrency(previous.metrics.liquidity.netBankCashFlow)} no mês anterior` : null;
  const incomeComparison = previous && overview.metrics.income.quality !== "insufficient" && previous.metrics.income.quality !== "insufficient"
    ? percentageComparison(overview.metrics.income.totalIncomeEstimate, previous.metrics.income.totalIncomeEstimate)
    : null;
  const savingsComparison = previous ? pointsComparison(overview.metrics.savings.estimatedSavingsRatePct, previous.metrics.savings.estimatedSavingsRatePct) : null;

  return <div className={`page-stack ${refreshing ? "page-refreshing" : ""}`}>
    <header className="page-header dashboard-header">
      <div>
        <span className="eyebrow">VISÃO GERAL</span>
        <h1>{todayGreeting}. Seu dinheiro está aqui.</h1>
        <p>Use o período mensal para analisar o mês sem misturar todo o histórico.</p>
      </div>
      <div className="page-header-actions">
        <PeriodFilter value={period} onChange={setPeriod} disabled={refreshing} />
        <div className="period-chip">{selectedPeriodLabel(overview)}</div>
      </div>
    </header>

    {error ? <div className="inline-warning">A atualização mais recente falhou: {error}</div> : null}

    <section className="hero-card">
      <div className="hero-copy">
        <span className="hero-kicker"><SparkleIcon /> Pipinho observou</span>
        <h2>{insights?.status === "ok" && insights.headline ? insights.headline : "Seu resumo financeiro está pronto para leitura."}</h2>
        <p>{overview.signals.length ? overview.signals[0]?.message : "Não há alertas determinísticos prioritários no período selecionado."}</p>
        <div className="hero-actions"><Link href="/assistente" className="primary-button">Conversar com o Pipinho</Link><Link href="/gastos" className="secondary-button">Ver gastos</Link></div>
      </div>
      <div className="hero-mascot"><div className="mascot-glow"/><Image src="/pipinho-icon.jpeg" alt="Ilustração do Pipinho" width={230} height={230} priority /></div>
    </section>

    <section className="metrics-grid">
      <MetricCard label="Gastos líquidos" value={formatCurrency(overview.metrics.spending.netSpending)} note={`${overview.metrics.spending.transactionCount} movimentações de gasto`} comparison={spendingComparison} tone="neutral" icon={<ArrowDownIcon />} />
      <MetricCard label="Fluxo bancário" value={formatCurrency(overview.metrics.liquidity.netBankCashFlow)} note={cashPositive ? "entradas superaram saídas" : "saídas superaram entradas"} comparison={cashComparison} tone={cashPositive ? "positive" : "negative"} icon={cashPositive ? <ArrowUpIcon /> : <ArrowDownIcon />} />
      <article className="metric-card metric-soft"><div className="metric-label-row"><span>Renda estimada</span><QualityBadge overview={overview} /></div><strong>{overview.metrics.income.quality === "insufficient" ? "—" : formatCurrency(overview.metrics.income.totalIncomeEstimate)}</strong><small>{overview.metrics.income.quality === "insufficient" ? "o engine não considera a evidência suficiente" : `${formatPercent(overview.metrics.income.classifiedIncomeShareOfBankInflowsPct)} das entradas classificadas`}</small>{incomeComparison ? <small className="metric-comparison">{incomeComparison}</small> : null}</article>
      <MetricCard label="Poupança estimada" value={savingsAvailable ? formatPercent(overview.metrics.savings.estimatedSavingsRatePct) : "—"} note={savingsAvailable ? formatCurrency(overview.metrics.savings.estimatedSavings) : "indisponível com a qualidade atual"} comparison={savingsComparison} tone="soft" />
    </section>

    <section className="dashboard-grid">
      <article className="panel panel-wide"><div className="panel-heading"><div><span className="eyebrow">CONTEXTO</span><h2>Evolução mensal</h2></div><span className="small-pill">últimos {Math.min(monthly.length, 8)} meses</span></div><TrendChart points={monthly} /></article>
      <article className="panel"><div className="panel-heading"><div><span className="eyebrow">COMPOSIÇÃO DO PERÍODO</span><h2>Gastos por categoria</h2></div><Link href="/gastos" className="text-link">detalhes →</Link></div><CategoryBars overview={overview} /></article>
    </section>

    <section className="dashboard-grid ai-grid">
      <article className="panel ai-panel"><div className="panel-heading"><div><span className="eyebrow">IA COM EVIDÊNCIA</span><h2>Leituras do Pipinho</h2></div><SparkleIcon className="panel-icon" /></div><div className="insight-list">
        {insights?.status === "ok" && insights.cards?.length ? insights.cards.slice(0, 3).map((card, index) => <div className={`insight-card insight-${card.kind}`} key={`${card.title}-${index}`}><div className="insight-top"><span>{card.kind === "warning" ? "Atenção" : card.kind === "opportunity" ? "Oportunidade" : "Contexto"}</span><small>confiança {card.confidence}</small></div><strong>{card.title}</strong><p>{card.message}</p><div className="evidence-row">{card.evidence.slice(0, 2).map((item) => <span key={item.ref}>{item.unit === "BRL" ? formatCurrency(item.value) : item.unit === "percent" ? formatPercent(item.value) : item.value ?? "—"}</span>)}</div></div>) : <p className="muted">A camada de insights não respondeu; os dados determinísticos continuam disponíveis.</p>}
      </div></article>
      <article className="panel trust-panel"><ShieldIcon className="trust-icon"/><span className="eyebrow">PRIVACIDADE E QUALIDADE</span><h2>O chat não recebe seu extrato cru.</h2><p>O backend envia métricas agregadas e usa grounding para limitar respostas sem evidência suficiente.</p><div className="trust-list"><span><i/> {overview.dataset.transactionCount} transações no período</span><span><i/> extrato cru fora do LLM</span><span><i/> {overview.quality.truncatedAccounts === 0 ? "histórico sem truncamento detectado" : `${overview.quality.truncatedAccounts} conta(s) truncada(s)`}</span></div></article>
    </section>
  </div>;
}

function DashboardSkeleton() {
  return <div className="page-stack"><div className="skeleton skeleton-title"/><div className="skeleton skeleton-hero"/><div className="metrics-grid">{Array.from({ length: 4 }).map((_, i) => <div className="skeleton skeleton-card" key={i}/>)}</div><div className="dashboard-grid"><div className="skeleton skeleton-panel"/><div className="skeleton skeleton-panel"/></div></div>;
}

function ErrorState({ message }: { message: string }) {
  return <div className="center-state"><Image src="/pipinho-icon.jpeg" alt="Pipinho" width={120} height={120}/><span className="eyebrow">NÃO CONSEGUI CARREGAR</span><h1>O Pipinho perdeu o fio dos dados.</h1><p>{message}</p><button className="primary-button" onClick={() => window.location.reload()}>Tentar novamente</button></div>;
}

function NoDataState({ message }: { message?: string }) {
  return <div className="center-state no-data-panel"><Image src="/pipinho-icon.jpeg" alt="Pipinho" width={96} height={96}/><span className="eyebrow">SEM DADOS NESTE PERÍODO</span><h1>Não encontrei movimentações neste mês.</h1><p>{message ?? "Troque o período acima para consultar outro mês ou todo o histórico disponível."}</p></div>;
}
