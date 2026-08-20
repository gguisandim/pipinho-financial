import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { financialApi } from "@/lib/backend";
import type { LargestExpensesResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return NextResponse.json({ error: "unauthorized", message: auth.message }, { status: auth.status });

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? "8");
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.round(rawLimit), 1), 10) : 8;

  try {
    const data = await financialApi<LargestExpensesResponse>(`/api/v1/dashboard/expenses/largest?limit=${limit}`);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "backend_unavailable", message: error instanceof Error ? error.message : "Backend indisponível." }, { status: 503 });
  }
}
