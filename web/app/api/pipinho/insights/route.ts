import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { financialApi } from "@/lib/backend";
import type { DashboardInsights } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const auth = await requireApiUser();
  if (!auth.ok) return NextResponse.json({ error: "unauthorized", message: auth.message }, { status: auth.status });

  try {
    const data = await financialApi<DashboardInsights>("/api/v1/dashboard/ai/insights", {
      method: "POST",
      body: JSON.stringify({ months: 12, maxCards: 4 }),
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "insights_unavailable", message: error instanceof Error ? error.message : "Insights indisponíveis." }, { status: 503 });
  }
}
