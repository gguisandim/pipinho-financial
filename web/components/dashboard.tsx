"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, ShieldIcon, SparkleIcon } from "./icons";
import { formatCurrency, formatMonth, formatPercent, labelCategory } from "@/lib/format";
import type { DashboardInsights, DashboardOverview, DashboardOverviewOk, MonthlyPoint } from "@/lib/types";

function MetricCard({ label, value, note, tone = "neutral", icon }: { label: string; value: string; note: string; tone?: "positive" | "negative" | "neutral" | "soft"; icon?: React.ReactNode }) {
  return <article className={`metric-card metric-${tone}`}>
    <div className="metric-label-row"><span>{label}</span>{icon}</div>
    <strong>{value}</strong>
    <small>{note}</small>
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

  if (!data.length) return <div className="empty-chart">Sem série mensal para este período.</div>;

  return <div className="trend-chart-wrap">
    <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolução mensal de entradas e gastos">
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="chart-axis" />
      <polyline points={inflows} className="chart-line chart-inflow" />
      <polyline points={spending} className="chart-line chart-spending" />
      {data.map((p, i) => <g key={p.month}><circle cx={x(i)} cy={y(p.liquidity.bankInflows)} r="4" className="chart-dot inflow"/><circle cx={x(i)} cy={y(p.spending.netSpending)} r="4" className="chart-dot spending"/></g>)}
    </svg>
    <div className="chart-labels">{data.map((p) => <span key={p.month}>{formatMonth(p.month)}</span>)}</div>
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

export function DashboardClient() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [insights, setInsights] = useState<DashboardInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [overviewResponse, insightResponse] = await Promise.all([
          fetch("/api/pipinho/overview", { cache: "no-store" }),
          fetch("/api/pipinho/insights", { method: "POST", cache: "no-store" }),
        ]);
        const overviewJson = await overviewResponse.json();
        const insightJson = await insightResponse.json();
        if (!overviewResponse.ok) throw new Error(overviewJson?.message ?? "Não foi possível carregar o dashboard.");
        if (!cancelled) {
          setOverview(overviewJson);
          setInsights(insightResponse.ok ? insightJson : null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar dados.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const todayGreeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  }, []);

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (!overview || overview.status !== "ok") return <NoDataState message={overview?.message} />;

  const savingsAvailable = overview.metrics.savings.available;
  const monthly = overview.monthly?.status === "ok" ? overview.monthly.points ?? [] : [];
  const cashPositive = overview.metrics.liquidity.netBankCashFlow >= 0;

  return <div className="page-stack">
    <header className="page-header dashboard-header">
      <div>
        <span className="eyebrow">VISÃO GERAL</span>
        <h1>{todayGreeting}. Seu dinheiro está aqui.</h1>
        <p>O backend calcula os números; o Pipinho ajuda você a interpretá-los.</p>
      </div>
      <div className="period-chip">{overview.dataset.selectedPeriod.start} <span>→</span> {overview.dataset.selectedPeriod.end}</div>
    </header>

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
      <MetricCard label="Gastos líquidos" value={formatCurrency(overview.metrics.spending.netSpending)} note={`${overview.metrics.spending.transactionCount} movimentações de gasto`} tone="neutral" icon={<ArrowDownIcon />} />
      <MetricCard label="Fluxo bancário" value={formatCurrency(overview.metrics.liquidity.netBankCashFlow)} note={cashPositive ? "entradas superaram saídas" : "saídas superaram entradas"} tone={cashPositive ? "positive" : "negative"} icon={cashPositive ? <ArrowUpIcon /> : <ArrowDownIcon />} />
      <article className="metric-card metric-soft"><div className="metric-label-row"><span>Renda estimada</span><QualityBadge overview={overview} /></div><strong>{overview.metrics.income.quality === "insufficient" ? "—" : formatCurrency(overview.metrics.income.totalIncomeEstimate)}</strong><small>{overview.metrics.income.quality === "insufficient" ? "o engine não considera a evidência suficiente" : `${formatPercent(overview.metrics.income.classifiedIncomeShareOfBankInflowsPct)} das entradas classificadas`}</small></article>
      <MetricCard label="Poupança estimada" value={savingsAvailable ? formatPercent(overview.metrics.savings.estimatedSavingsRatePct) : "—"} note={savingsAvailable ? formatCurrency(overview.metrics.savings.estimatedSavings) : "indisponível com a qualidade atual"} tone="soft" />
    </section>

    <section className="dashboard-grid">
      <article className="panel panel-wide"><div className="panel-heading"><div><span className="eyebrow">MOVIMENTO</span><h2>Evolução mensal</h2></div><span className="small-pill">últimos {Math.min(monthly.length, 8)} meses</span></div><TrendChart points={monthly} /></article>
      <article className="panel"><div className="panel-heading"><div><span className="eyebrow">COMPOSIÇÃO</span><h2>Gastos por categoria</h2></div><Link href="/gastos" className="text-link">detalhes →</Link></div><CategoryBars overview={overview} /></article>
    </section>

    <section className="dashboard-grid ai-grid">
      <article className="panel ai-panel"><div className="panel-heading"><div><span className="eyebrow">IA COM EVIDÊNCIA</span><h2>Leituras do Pipinho</h2></div><SparkleIcon className="panel-icon" /></div><div className="insight-list">
        {insights?.status === "ok" && insights.cards?.length ? insights.cards.slice(0, 3).map((card, index) => <div className={`insight-card insight-${card.kind}`} key={`${card.title}-${index}`}><div className="insight-top"><span>{card.kind === "warning" ? "Atenção" : card.kind === "opportunity" ? "Oportunidade" : "Contexto"}</span><small>confiança {card.confidence}</small></div><strong>{card.title}</strong><p>{card.message}</p><div className="evidence-row">{card.evidence.slice(0, 2).map((item) => <span key={item.ref}>{item.unit === "BRL" ? formatCurrency(item.value) : item.unit === "percent" ? formatPercent(item.value) : item.value ?? "—"}</span>)}</div></div>) : <p className="muted">A camada de insights não respondeu; os dados determinísticos continuam disponíveis.</p>}
      </div></article>
      <article className="panel trust-panel"><ShieldIcon className="trust-icon"/><span className="eyebrow">PRIVACIDADE E QUALIDADE</span><h2>O chat não recebe seu extrato cru.</h2><p>O backend envia métricas agregadas e usa grounding para limitar respostas sem evidência suficiente.</p><div className="trust-list"><span><i/> {overview.dataset.transactionCount} transações normalizadas</span><span><i/> extrato cru fora do LLM</span><span><i/> {overview.quality.truncatedAccounts === 0 ? "histórico sem truncamento detectado" : `${overview.quality.truncatedAccounts} conta(s) truncada(s)`}</span></div></article>
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
  return <div className="center-state"><Image src="/pipinho-icon.jpeg" alt="Pipinho" width={120} height={120}/><span className="eyebrow">SEM DADOS</span><h1>Ainda não há movimentações para mostrar.</h1><p>{message ?? "Verifique o período disponível e a integração da Pluggy no backend."}</p></div>;
}
