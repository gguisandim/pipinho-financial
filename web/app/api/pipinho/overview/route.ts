import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { financialApi } from "@/lib/backend";
import type { DashboardOverview } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return NextResponse.json({ error: "unauthorized", message: auth.message }, { status: auth.status });

  try {
    const data = await financialApi<DashboardOverview>("/api/v1/dashboard/overview?months=12");
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "backend_unavailable", message: error instanceof Error ? error.message : "Backend indisponível." }, { status: 503 });
  }
}
