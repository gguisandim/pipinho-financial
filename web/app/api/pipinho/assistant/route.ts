import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { financialApi } from "@/lib/backend";
import type { AssistantResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    conversationId: z.string().trim().min(8).max(100).optional(),
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
      .optional()
      .default([]),
  })
  .strict();

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
