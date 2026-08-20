import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { financialApi } from "@/lib/backend";
import type { LargestExpensesResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

function safeDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return NextResponse.json({ error: "unauthorized", message: auth.message }, { status: auth.status });

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? "8");
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.round(rawLimit), 1), 10) : 8;
  const params = new URLSearchParams({ limit: String(limit) });
  const startDate = safeDate(url.searchParams.get("startDate"));
  const endDate = safeDate(url.searchParams.get("endDate"));
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);

  try {
    const data = await financialApi<LargestExpensesResponse>(`/api/v1/dashboard/expenses/largest?${params.toString()}`);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "backend_unavailable", message: error instanceof Error ? error.message : "Backend indisponível." }, { status: 503 });
  }
}
