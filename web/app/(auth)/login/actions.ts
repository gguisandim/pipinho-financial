"use server";

import { redirect } from "next/navigation";
import { isEmailAllowed } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Informe e-mail e senha." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: "E-mail ou senha inválidos." };

  if (!isEmailAllowed(email)) {
    await supabase.auth.signOut();
    return { error: "Esta conta não está autorizada para acessar este Pipinho." };
  }

  redirect("/dashboard");
}
