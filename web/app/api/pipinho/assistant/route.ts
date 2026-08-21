import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { financialApi } from "@/lib/backend";
import {
  CHAT_CONTEXT_MESSAGE_LIMIT,
  createChatSession,
  deleteChatSession,
  getChatMessages,
  getChatRetentionDays,
  getChatSession,
  persistChatTurn,
  pruneExpiredChatSessions,
  routingMemoryToSummary,
  type ChatSessionRecord,
} from "@/lib/chat-memory";
import { createClient } from "@/lib/supabase/server";
import { ensureGoogleCalendarFresh, getCalendarConnectionStatus } from "@/lib/google-calendar";
import { buildRoutineContext } from "@/lib/routine-context";
import type { AssistantResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    conversationId: z.string().uuid().optional(),
    // Compatibilidade temporária com a C11.1/C11.2. Na C11.3 o servidor
    // ignora o histórico enviado pelo browser e recupera a memória pelo Supabase.
    history: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(1000),
          })
          .strict(),
      )
      .max(10)
      .optional(),
  })
  .strict();

function verificationPassed(result: AssistantResponse): boolean {
  return Object.values(result.grounding).every(Boolean);
}

function displayMeta(result: AssistantResponse): string {
  const contextual = result.conversation?.contextualRouting ? " · contexto usado" : "";
  return `${result.meta.toolCallCount} consulta(s) · ${Math.round(result.meta.latencyMs / 100) / 10}s${contextual}`;
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", message: auth.message },
      { status: auth.status },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", message: "Pergunta inválida." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const conversationId = parsed.data.conversationId ?? randomUUID();
  let memoryAvailable = true;
  let memoryWarning: string | undefined;
  let session: ChatSessionRecord | null = null;
  let history: Array<{ role: "user" | "assistant"; content: string }> = [];
  let memorySummary: string | undefined;

  try {
    await pruneExpiredChatSessions(supabase, auth.userId);

    if (parsed.data.conversationId) {
      session = await getChatSession(supabase, auth.userId, conversationId);
      if (!session) {
        return NextResponse.json(
          { error: "conversation_not_found", message: "Conversa não encontrada ou expirada." },
          { status: 404 },
        );
      }

      const storedMessages = await getChatMessages(
        supabase,
        auth.userId,
        conversationId,
        CHAT_CONTEXT_MESSAGE_LIMIT,
      );
      history = storedMessages.map(({ role, content }) => ({ role, content }));
      memorySummary = routingMemoryToSummary(session.routingMemory);
    }
  } catch {
    memoryAvailable = false;
    memoryWarning = "Memória persistente indisponível; a resposta atual não será sincronizada.";
    // Para conversa nova, o agente continua funcionando sem memória. Para uma
    // conversa existente, não aceitamos histórico do cliente como substituto,
    // pois isso quebraria a fronteira de confiança introduzida na C11.3.
    if (parsed.data.conversationId) {
      return NextResponse.json(
        { error: "memory_unavailable", message: memoryWarning },
        { status: 503 },
      );
    }
  }

  try {
    let routineContext;
    try {
      let connection = await getCalendarConnectionStatus(auth.userId);
      if (connection.connected) {
        try {
          connection = await ensureGoogleCalendarFresh(auth.userId, connection);
        } catch {
          // Falha de refresh não derruba o agente: usa o último snapshot válido.
          connection = await getCalendarConnectionStatus(auth.userId).catch(() => connection);
        }
      }
      routineContext = await buildRoutineContext(auth.userId, connection);
    } catch {
      routineContext = { status: "unavailable" as const, generatedAt: new Date().toISOString(), timezone: "UTC", lastSyncedAt: null, events: [] };
    }
    const data = await financialApi<AssistantResponse>("/api/v1/assistant", {
      method: "POST",
      body: JSON.stringify({
        question: parsed.data.question,
        conversationId,
        history,
        ...(memorySummary ? { memorySummary } : {}),
        routineContext,
      }),
    });

    let persisted = false;
    if (memoryAvailable) {
      let createdNow = false;
      try {
        if (!session) {
          session = await createChatSession(
            supabase,
            auth.userId,
            conversationId,
            parsed.data.question,
          );
          createdNow = true;
        }
        await persistChatTurn({
          supabase,
          userId: auth.userId,
          session,
          question: parsed.data.question,
          answer: data.answer,
          verified: verificationPassed(data),
          metadata: {
            displayMeta: displayMeta(data),
            executionMode: data.executionMode,
            toolCallCount: data.meta.toolCallCount,
            iterations: data.meta.iterations,
            latencyMs: data.meta.latencyMs,
            contextualRouting: data.conversation?.contextualRouting ?? false,
          },
        });
        persisted = true;
      } catch {
        if (createdNow) {
          await deleteChatSession(supabase, auth.userId, conversationId).catch(() => false);
        }
        memoryWarning = "A resposta foi concluída, mas não foi possível salvar a conversa no Supabase.";
      }
    }

    return NextResponse.json({
      ...data,
      conversation: {
        ...(data.conversation ?? {
          historyMessagesUsed: history.length,
          contextualRouting: false,
        }),
        id: conversationId,
      },
      memory: {
        persisted,
        retentionDays: getChatRetentionDays(),
        historyMessagesLoaded: history.length,
        ...(memoryWarning ? { warning: memoryWarning } : {}),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "assistant_unavailable",
        message: error instanceof Error ? error.message : "Assistente indisponível.",
      },
      { status: 503 },
    );
  }
}
