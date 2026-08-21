import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import {
  deleteAllChatSessions,
  getChatRetentionDays,
  listChatSessions,
  pruneExpiredChatSessions,
} from "@/lib/chat-memory";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", message: auth.message },
      { status: auth.status },
    );
  }

  try {
    const supabase = await createClient();
    const pruned = await pruneExpiredChatSessions(supabase, auth.userId);
    const sessions = await listChatSessions(supabase, auth.userId);

    return NextResponse.json({
      status: "ok",
      sessions: sessions.map((session) => ({
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      })),
      memory: {
        retentionDays: getChatRetentionDays(),
        pruned,
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "memory_unavailable",
        message:
          "A memória de conversa ainda não está disponível. Aplique a migration C11.3 no Supabase.",
      },
      { status: 503 },
    );
  }
}

export async function DELETE() {
  const auth = await requireApiUser();
  if (!auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", message: auth.message },
      { status: auth.status },
    );
  }

  try {
    const supabase = await createClient();
    const deleted = await deleteAllChatSessions(supabase, auth.userId);
    return NextResponse.json({ status: "ok", deleted });
  } catch {
    return NextResponse.json(
      { error: "memory_unavailable", message: "Não foi possível limpar a memória de conversa." },
      { status: 503 },
    );
  }
}
