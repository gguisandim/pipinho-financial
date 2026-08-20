import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { financialApi } from "@/lib/backend";
import type { DashboardInsights } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  months: z.number().int().min(1).max(24).optional(),
  maxCards: z.number().int().min(1).max(6).optional(),
}).strict();

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return NextResponse.json({ error: "unauthorized", message: auth.message }, { status: auth.status });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", message: "Período inválido." }, { status: 400 });

  try {
    const data = await financialApi<DashboardInsights>("/api/v1/dashboard/ai/insights", {
      method: "POST",
      body: JSON.stringify({ months: 12, maxCards: 4, ...parsed.data }),
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "insights_unavailable", message: error instanceof Error ? error.message : "Insights indisponíveis." }, { status: 503 });
  }
}
