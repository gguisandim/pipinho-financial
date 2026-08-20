import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { financialApi } from "@/lib/backend";
import type { AssistantResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({ question: z.string().trim().min(3).max(500) }).strict();

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return NextResponse.json({ error: "unauthorized", message: auth.message }, { status: auth.status });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", message: "Pergunta inválida." }, { status: 400 });

  try {
    const data = await financialApi<AssistantResponse>("/api/v1/assistant", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "assistant_unavailable", message: error instanceof Error ? error.message : "Assistente indisponível." }, { status: 503 });
  }
}
