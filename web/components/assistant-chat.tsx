"use client";

import Image from "next/image";
import { FormEvent, useRef, useState } from "react";
import { SendIcon, ShieldIcon, SparkleIcon } from "./icons";
import type { AssistantResponse } from "@/lib/types";

type Message = {
  role: "user" | "assistant";
  content: string;
  verified?: boolean;
  meta?: string;
};

const suggestions = [
  "Quanto eu gastei este mês?",
  "Qual foi meu último gasto?",
  "Quanto eu costumo gastar por dia?",
  "Quanto foi aquele Uber de ontem?",
];

function makeConversationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationIdRef = useRef<string | null>(null);

  async function send(content: string) {
    const clean = content.trim();
    if (!clean || loading) return;

    const history = messages
      .slice(-10)
      .map(({ role, content: messageContent }) => ({ role, content: messageContent }));
    conversationIdRef.current ??= makeConversationId();

    setMessages((prev) => [...prev, { role: "user", content: clean }]);
    setQuestion("");
    setLoading(true);

    try {
      const response = await fetch("/api/pipinho/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: clean,
          conversationId: conversationIdRef.current,
          history,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message ?? "O assistente não respondeu.");
      const result = payload as AssistantResponse;
      const verified = Object.values(result.grounding).every(Boolean);
      const contextLabel = result.conversation?.contextualRouting ? " · contexto usado" : "";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.answer,
          verified,
          meta: `${result.meta.toolCallCount} consulta(s) · ${Math.round(result.meta.latencyMs / 100) / 10}s${contextLabel}`,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Falha ao consultar o assistente.",
          verified: false,
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(question);
  }

  function newConversation() {
    if (loading) return;
    setMessages([]);
    setQuestion("");
    conversationIdRef.current = null;
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  return <div className="assistant-layout">
    <section className="assistant-main">
      <header className="assistant-header">
        <div className="assistant-avatar-wrap"><Image src="/pipinho-icon.jpeg" alt="Pipinho" width={72} height={72} priority/><span className="online-dot"/></div>
        <div className="assistant-header-copy"><span className="eyebrow">ASSISTENTE FINANCEIRO</span><h1>Converse com o Pipinho</h1><p>Agora ele usa o contexto recente da conversa e consulta seus dados quando precisa.</p></div>
        {messages.length > 0 && <button className="assistant-new-chat" type="button" onClick={newConversation}>Nova conversa</button>}
      </header>

      <div className={`conversation ${messages.length ? "has-messages" : ""}`}>
        {!messages.length && <div className="assistant-empty"><SparkleIcon/><h2>Pode falar do seu jeito.</h2><p>Você pode começar com uma pergunta completa e continuar com coisas como “e mês passado?”, “e no Nubank?” ou “e ontem?”.</p><div className="suggestion-grid">{suggestions.map((item) => <button key={item} onClick={() => void send(item)}>{item}<span>↗</span></button>)}</div></div>}
        {messages.map((message, index) => <div className={`message-row ${message.role}`} key={index}>
          {message.role === "assistant" && <Image src="/pipinho-icon.jpeg" alt="" width={38} height={38}/>}<div className="message-bubble"><p>{message.content}</p>{message.role === "assistant" && <div className={`message-proof ${message.verified ? "verified" : "unverified"}`}><ShieldIcon/>{message.verified ? "Verificado pelos seus dados" : "Resposta com verificação parcial"}{message.meta && <small>{message.meta}</small>}</div>}</div>
        </div>)}
        {loading && <div className="message-row assistant"><Image src="/pipinho-icon.jpeg" alt="" width={38} height={38}/><div className="message-bubble typing"><i/><i/><i/></div></div>}
      </div>

      <form className="composer" onSubmit={submit}>
        <textarea ref={inputRef} value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(question); } }} placeholder="Ex.: e no mês passado?" maxLength={500} rows={1}/>
        <button type="submit" aria-label="Enviar" disabled={loading || !question.trim()}><SendIcon/></button>
      </form>
      <p className="composer-note">O contexto é enviado apenas nos últimos turnos desta conversa. Persistência no Supabase fica para uma etapa posterior do Ciclo 11.</p>
    </section>
    <aside className="assistant-side">
      <span className="eyebrow">CICLO 11</span>
      <h2>Mais conversa, menos comando.</h2>
      <div className="flow-list"><div><strong>1</strong><p><b>Você fala naturalmente</b><span>inclusive com follow-ups curtos</span></p></div><div><strong>2</strong><p><b>O contexto resolve a intenção</b><span>sem transformar histórico em fato financeiro</span></p></div><div><strong>3</strong><p><b>As ferramentas consultam</b><span>recentes, buscas, médias e métricas</span></p></div><div><strong>4</strong><p><b>Os guards continuam valendo</b><span>números ainda precisam de evidência atual</span></p></div></div>
    </aside>
  </div>;
}
