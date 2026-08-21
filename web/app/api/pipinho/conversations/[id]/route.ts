import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import {
  deleteChatSession,
  getChatMessages,
  getChatSession,
} from "@/lib/chat-memory";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (!auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", message: auth.message },
      { status: auth.status },
    );
  }

  const { id } = await context.params;

  try {
    const supabase = await createClient();
    const session = await getChatSession(supabase, auth.userId, id);
    if (!session) {
      return NextResponse.json(
        { error: "conversation_not_found", message: "Conversa não encontrada." },
        { status: 404 },
      );
    }

    const messages = await getChatMessages(supabase, auth.userId, id);
    return NextResponse.json({
      status: "ok",
      session: {
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        verified: message.verified,
        meta:
          typeof message.metadata.displayMeta === "string"
            ? message.metadata.displayMeta
            : undefined,
        createdAt: message.createdAt,
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "memory_unavailable", message: "Não foi possível carregar esta conversa." },
      { status: 503 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (!auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", message: auth.message },
      { status: auth.status },
    );
  }

  const { id } = await context.params;

  try {
    const supabase = await createClient();
    const deleted = await deleteChatSession(supabase, auth.userId, id);
    if (!deleted) {
      return NextResponse.json(
        { error: "conversation_not_found", message: "Conversa não encontrada." },
        { status: 404 },
      );
    }
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json(
      { error: "memory_unavailable", message: "Não foi possível excluir esta conversa." },
      { status: 503 },
    );
  }
}
