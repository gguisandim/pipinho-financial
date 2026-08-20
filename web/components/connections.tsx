"use client";

import { useEffect, useState } from "react";
import { ShieldIcon } from "./icons";
import type { DashboardOverview } from "@/lib/types";

export function ConnectionsClient() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  useEffect(() => { fetch("/api/pipinho/overview", { cache: "no-store" }).then((r) => r.json()).then(setOverview).catch(() => setOverview(null)); }, []);
  const institutions = overview?.status === "ok" ? overview.institutions : [];

  return <div className="page-stack">
    <header className="page-header"><div><span className="eyebrow">CONEXÕES</span><h1>Instituições vistas pelo backend.</h1><p>Esta V1 lê os Items já configurados na API. A criação de novas conexões ainda depende do fluxo Pluggy Connect no backend.</p></div></header>
    <section className="connection-grid">
      {institutions.length ? institutions.map((item) => <article className="connection-card" key={item.institution}><div className="connection-logo">{item.institution.slice(0, 2).toUpperCase()}</div><div><strong>{item.institution}</strong><span>{item.transactionCount} transações de gasto no período</span></div><span className="connection-status"><i/> encontrada</span></article>) : <article className="connection-card"><div className="connection-logo">?</div><div><strong>Nenhuma instituição carregada</strong><span>Verifique PLUGGY_ITEM_IDS no backend.</span></div></article>}
      <article className="connection-card connection-placeholder"><div className="connection-logo">+</div><div><strong>Conectar nova instituição</strong><span>Próximo passo: endpoint de connect token + persistência do Item.</span></div><button disabled>em breve</button></article>
    </section>
    <section className="architecture-note"><ShieldIcon/><div><span className="eyebrow">DECISÃO DA V1</span><h2>Supabase autentica o acesso; Pluggy continua sendo a fonte financeira.</h2><p>Não há necessidade de duplicar transações no Supabase agora. Quando o Pipinho virar multiusuário, a tabela de conexões pode associar <code>user_id</code> a <code>pluggy_item_id</code>.</p></div></section>
  </div>;
}
