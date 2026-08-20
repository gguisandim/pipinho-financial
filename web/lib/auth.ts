import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export function isEmailAllowed(email: string | null | undefined): boolean {
  const raw = process.env.PIPINHO_ALLOWED_EMAILS?.trim();
  if (!raw) return true;
  if (!email) return false;

  const allowed = new Set(
    raw
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );

  return allowed.has(email.toLowerCase());
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isEmailAllowed(user.email)) redirect("/unauthorized");
  return user;
}

export async function requireApiUser(): Promise<
  | { ok: true; email: string | null }
  | { ok: false; status: 401 | 403; message: string }
> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, status: 401, message: "Sessão ausente ou expirada." };
  }
  if (!isEmailAllowed(user.email)) {
    return { ok: false, status: 403, message: "Conta não autorizada para este Pipinho." };
  }
  return { ok: true, email: user.email ?? null };
}
