import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { financialApi } from "@/lib/backend";
import type { MonthlySeriesResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return NextResponse.json({ error: "unauthorized", message: auth.message }, { status: auth.status });

  const url = new URL(request.url);
  const rawMonths = Number(url.searchParams.get("months") ?? "12");
  const months = Number.isFinite(rawMonths) ? Math.min(Math.max(Math.round(rawMonths), 1), 24) : 12;

  try {
    const data = await financialApi<MonthlySeriesResponse>(`/api/v1/dashboard/series/monthly?months=${months}`);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "backend_unavailable", message: error instanceof Error ? error.message : "Backend indisponível." }, { status: 503 });
  }
}
