"use client";

import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import { SendIcon, ShieldIcon, SparkleIcon } from "./icons";
import type { AssistantResponse } from "@/lib/types";

type Message = {
  id?: number | string;
  role: "user" | "assistant";
  content: string;
  verified?: boolean;
  meta?: string;
};

type ConversationSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type MemoryStatus = "loading" | "ready" | "unavailable";

const suggestions = [
  "Quanto eu tenho agora?",
  "Quanto tem no roxinho?",
  "Quanto eu costumo gastar por dia?",
  "Quanto foi aquele Uber de ontem?",
];

function formatSessionDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function MemoryPanel({
  sessions,
  activeId,
  status,
  disabled,
  onSelect,
  onClearAll,
}: {
  sessions: ConversationSession[];
  activeId: string | null;
  status: MemoryStatus;
  disabled: boolean;
  onSelect: (id: string) => void;
  onClearAll: () => void;
}) {
  return (
    <div className="assistant-memory">
      <div className="assistant-memory-heading">
        <div>
          <span className="eyebrow">MEMÓRIA</span>
          <strong>Conversas recentes</strong>
        </div>
        {sessions.length > 0 && (
          <button type="button" onClick={onClearAll} disabled={disabled}>
            Limpar tudo
          </button>
        )}
      </div>

      {status === "loading" && <p className="assistant-memory-state">Carregando histórico…</p>}
      {status === "unavailable" && (
        <p className="assistant-memory-state warning">
          Memória não configurada. O chat continua funcionando, mas não sincroniza entre dispositivos.
        </p>
      )}
      {status === "ready" && sessions.length === 0 && (
        <p className="assistant-memory-state">As conversas salvas vão aparecer aqui.</p>
      )}

      <div className="assistant-session-list">
        {sessions.map((session) => (
          <button
            className={session.id === activeId ? "active" : ""}
            disabled={disabled}
            key={session.id}
            onClick={() => onSelect(session.id)}
            type="button"
          >
            <span>{session.title}</span>
            <small>{formatSessionDate(session.updatedAt)}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [memoryStatus, setMemoryStatus] = useState<MemoryStatus>("loading");
  const [memoryNotice, setMemoryNotice] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function refreshSessions() {
    try {
      const response = await fetch("/api/pipinho/conversations", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message ?? "Memória indisponível.");
      setSessions(Array.isArray(payload.sessions) ? payload.sessions : []);
      setMemoryStatus("ready");
      setMemoryNotice(null);
    } catch (error) {
      setMemoryStatus("unavailable");
      setMemoryNotice(error instanceof Error ? error.message : "Memória indisponível.");
    }
  }

  useEffect(() => {
    void refreshSessions();
  }, []);

  async function loadConversation(id: string) {
    if (loading || loadingHistory) return;
    setLoadingHistory(true);
    setMemoryNotice(null);
    try {
      const response = await fetch(`/api/pipinho/conversations/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message ?? "Não foi possível abrir a conversa.");

      setMessages(
        (Array.isArray(payload.messages) ? payload.messages : []).map((message: Message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          verified: message.role === "assistant" ? Boolean(message.verified) : undefined,
          meta: message.meta,
        })),
      );
      setActiveConversationId(id);
      setHistoryOpen(false);
      setMemoryStatus("ready");
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (error) {
      setMemoryNotice(error instanceof Error ? error.message : "Não foi possível abrir a conversa.");
    } finally {
      setLoadingHistory(false);
    }
  }

  async function send(content: string) {
    const clean = content.trim();
    if (!clean || loading || loadingHistory) return;

    setMessages((prev) => [...prev, { role: "user", content: clean }]);
    setQuestion("");
    setLoading(true);
    setMemoryNotice(null);

    try {
      const response = await fetch("/api/pipinho/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: clean,
          ...(activeConversationId ? { conversationId: activeConversationId } : {}),
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

      const persistedId = result.memory?.persisted ? result.conversation?.id : null;
      if (persistedId) {
        setActiveConversationId(persistedId);
        setMemoryStatus("ready");
        await refreshSessions();
      } else if (result.memory?.warning) {
        setMemoryStatus("unavailable");
        setMemoryNotice(result.memory.warning);
      }
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
    if (loading || loadingHistory) return;
    setMessages([]);
    setQuestion("");
    setActiveConversationId(null);
    setMemoryNotice(null);
    setHistoryOpen(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function deleteCurrentConversation() {
    if (!activeConversationId || loading || loadingHistory) return;
    if (!window.confirm("Excluir esta conversa da memória do Pipinho?")) return;

    setLoadingHistory(true);
    try {
      const response = await fetch(
        `/api/pipinho/conversations/${encodeURIComponent(activeConversationId)}`,
        { method: "DELETE" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message ?? "Não foi possível excluir a conversa.");
      setMessages([]);
      setActiveConversationId(null);
      await refreshSessions();
    } catch (error) {
      setMemoryNotice(error instanceof Error ? error.message : "Não foi possível excluir a conversa.");
    } finally {
      setLoadingHistory(false);
    }
  }

  async function clearAllConversations() {
    if (loading || loadingHistory || !sessions.length) return;
    if (!window.confirm("Excluir todas as conversas salvas do Pipinho?")) return;

    setLoadingHistory(true);
    try {
      const response = await fetch("/api/pipinho/conversations", { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message ?? "Não foi possível limpar a memória.");
      setSessions([]);
      setMessages([]);
      setActiveConversationId(null);
      setMemoryNotice(null);
      setMemoryStatus("ready");
      setHistoryOpen(false);
    } catch (error) {
      setMemoryNotice(error instanceof Error ? error.message : "Não foi possível limpar a memória.");
    } finally {
      setLoadingHistory(false);
    }
  }

  const controlsDisabled = loading || loadingHistory;

  return (
    <div className="assistant-layout">
      <section className="assistant-main">
        <header className="assistant-header">
          <div className="assistant-avatar-wrap">
            <Image src="/pipinho-icon.jpeg" alt="Pipinho" width={72} height={72} priority />
            <span className="online-dot" />
          </div>
          <div className="assistant-header-copy">
            <span className="eyebrow">ASSISTENTE FINANCEIRO</span>
            <h1>Converse com o Pipinho</h1>
            <p>O contexto recente agora pode acompanhar você entre dispositivos.</p>
          </div>
          <div className="assistant-header-actions">
            <button
              className="assistant-history-toggle"
              type="button"
              onClick={() => setHistoryOpen((current) => !current)}
              disabled={controlsDisabled}
            >
              Conversas
            </button>
            {(messages.length > 0 || activeConversationId) && (
              <button
                className="assistant-new-chat"
                type="button"
                onClick={newConversation}
                disabled={controlsDisabled}
              >
                Nova conversa
              </button>
            )}
          </div>
        </header>

        {historyOpen && (
          <div className="assistant-mobile-memory">
            <MemoryPanel
              sessions={sessions}
              activeId={activeConversationId}
              status={memoryStatus}
              disabled={controlsDisabled}
              onSelect={(id) => void loadConversation(id)}
              onClearAll={() => void clearAllConversations()}
            />
          </div>
        )}

        {memoryNotice && <div className="assistant-memory-notice">{memoryNotice}</div>}

        <div className={`conversation ${messages.length ? "has-messages" : ""}`}>
          {loadingHistory && !messages.length && (
            <div className="assistant-empty compact-empty"><p>Carregando conversa…</p></div>
          )}
          {!messages.length && !loadingHistory && (
            <div className="assistant-empty">
              <SparkleIcon />
              <h2>Pode falar do seu jeito.</h2>
              <p>
                Agora você pode retomar conversas anteriores sem depender do histórico local do navegador.
              </p>
              <div className="suggestion-grid">
                {suggestions.map((item) => (
                  <button key={item} onClick={() => void send(item)}>
                    {item}<span>↗</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message, index) => (
            <div className={`message-row ${message.role}`} key={message.id ?? index}>
              {message.role === "assistant" && (
                <Image src="/pipinho-icon.jpeg" alt="" width={38} height={38} />
              )}
              <div className="message-bubble">
                <p>{message.content}</p>
                {message.role === "assistant" && (
                  <div className={`message-proof ${message.verified ? "verified" : "unverified"}`}>
                    <ShieldIcon />
                    {message.verified ? "Verificado pelos seus dados" : "Resposta com verificação parcial"}
                    {message.meta && <small>{message.meta}</small>}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="message-row assistant">
              <Image src="/pipinho-icon.jpeg" alt="" width={38} height={38} />
              <div className="message-bubble typing"><i /><i /><i /></div>
            </div>
          )}
        </div>

        <form className="composer" onSubmit={submit}>
          <textarea
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(question);
              }
            }}
            placeholder="Ex.: e no mês passado?"
            maxLength={500}
            rows={1}
          />
          <button type="submit" aria-label="Enviar" disabled={controlsDisabled || !question.trim()}>
            <SendIcon />
          </button>
        </form>
        <div className="assistant-memory-footer">
          <p className="composer-note">
            O Supabase guarda o histórico; apenas até 10 mensagens recentes entram no contexto de cada resposta.
          </p>
          {activeConversationId && (
            <button type="button" onClick={() => void deleteCurrentConversation()} disabled={controlsDisabled}>
              Excluir conversa
            </button>
          )}
        </div>
      </section>

      <aside className="assistant-side">
        <span className="eyebrow">CICLO 11 · C11.3</span>
        <h2>Memória controlada.</h2>
        <div className="flow-list">
          <div><strong>1</strong><p><b>Supabase persiste</b><span>sessões e mensagens por usuário autenticado</span></p></div>
          <div><strong>2</strong><p><b>RLS isola usuários</b><span>cada conta acessa somente a própria memória</span></p></div>
          <div><strong>3</strong><p><b>Contexto continua curto</b><span>o agente recebe somente os turnos recentes</span></p></div>
          <div><strong>4</strong><p><b>Você pode apagar</b><span>uma conversa ou toda a memória salva</span></p></div>
        </div>
        <MemoryPanel
          sessions={sessions}
          activeId={activeConversationId}
          status={memoryStatus}
          disabled={controlsDisabled}
          onSelect={(id) => void loadConversation(id)}
          onClearAll={() => void clearAllConversations()}
        />
      </aside>
    </div>
  );
}
