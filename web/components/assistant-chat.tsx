"use client";

import Image from "next/image";
import { FormEvent, useRef, useState } from "react";
import { SendIcon, ShieldIcon, SparkleIcon } from "./icons";
import type { AssistantResponse } from "@/lib/types";

type Message = { role: "user" | "assistant"; content: string; verified?: boolean; meta?: string };

const suggestions = [
  "Quanto eu gastei neste mês?",
  "Onde estou gastando mais?",
  "Como está minha taxa de poupança?",
  "Quais gastos merecem atenção?",
];

export function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function send(content: string) {
    const clean = content.trim();
    if (clean.length < 3 || loading) return;
    setMessages((prev) => [...prev, { role: "user", content: clean }]);
    setQuestion("");
    setLoading(true);
    try {
      const response = await fetch("/api/pipinho/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: clean }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message ?? "O assistente não respondeu.");
      const result = payload as AssistantResponse;
      const verified = Object.values(result.grounding).every(Boolean);
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: result.answer,
        verified,
        meta: `${result.meta.toolCallCount} consulta(s) · ${Math.round(result.meta.latencyMs / 100) / 10}s`,
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: err instanceof Error ? err.message : "Falha ao consultar o assistente.",
        verified: false,
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(question);
  }

  return <div className="assistant-layout">
    <section className="assistant-main">
      <header className="assistant-header">
        <div className="assistant-avatar-wrap"><Image src="/pipinho-icon.jpeg" alt="Pipinho" width={72} height={72} priority/><span className="online-dot"/></div>
        <div><span className="eyebrow">ASSISTENTE FINANCEIRO</span><h1>Pergunte ao Pipinho</h1><p>Respostas construídas sobre as ferramentas e os guardrails do backend.</p></div>
      </header>

      <div className={`conversation ${messages.length ? "has-messages" : ""}`}>
        {!messages.length && <div className="assistant-empty"><SparkleIcon/><h2>O que você quer entender hoje?</h2><p>Pergunte sobre seus dados financeiros reais. O Pipinho não precisa receber seu extrato cru para responder.</p><div className="suggestion-grid">{suggestions.map((item) => <button key={item} onClick={() => void send(item)}>{item}<span>↗</span></button>)}</div></div>}
        {messages.map((message, index) => <div className={`message-row ${message.role}`} key={index}>
          {message.role === "assistant" && <Image src="/pipinho-icon.jpeg" alt="" width={38} height={38}/>}<div className="message-bubble"><p>{message.content}</p>{message.role === "assistant" && <div className={`message-proof ${message.verified ? "verified" : "unverified"}`}><ShieldIcon/>{message.verified ? "Verificado pelos seus dados" : "Resposta com verificação parcial"}{message.meta && <small>{message.meta}</small>}</div>}</div>
        </div>)}
        {loading && <div className="message-row assistant"><Image src="/pipinho-icon.jpeg" alt="" width={38} height={38}/><div className="message-bubble typing"><i/><i/><i/></div></div>}
      </div>

      <form className="composer" onSubmit={submit}>
        <textarea ref={inputRef} value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(question); } }} placeholder="Ex.: compare meus gastos recentes..." maxLength={500} rows={1}/>
        <button type="submit" aria-label="Enviar" disabled={loading || question.trim().length < 3}><SendIcon/></button>
      </form>
      <p className="composer-note">O assistente atual recebe uma pergunta por vez; histórico conversacional persistente ainda não faz parte do backend.</p>
    </section>
    <aside className="assistant-side">
      <span className="eyebrow">COMO FUNCIONA</span>
      <h2>Não é um chat solto.</h2>
      <div className="flow-list"><div><strong>1</strong><p><b>Você pergunta</b><span>em linguagem natural</span></p></div><div><strong>2</strong><p><b>O agente chama ferramentas</b><span>sobre dados Pluggy normalizados</span></p></div><div><strong>3</strong><p><b>Os guards verificam</b><span>causalidade, qualidade e evidência</span></p></div><div><strong>4</strong><p><b>O Pipinho responde</b><span>sem inventar métricas</span></p></div></div>
    </aside>
  </div>;
}
