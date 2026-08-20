"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, {});

  return (
    <form action={action} className="login-form">
      <label>
        <span>E-mail</span>
        <input name="email" type="email" autoComplete="email" placeholder="voce@email.com" required />
      </label>
      <label>
        <span>Senha</span>
        <input name="password" type="password" autoComplete="current-password" placeholder="••••••••" required />
      </label>
      {state.error && <p className="form-error">{state.error}</p>}
      <button className="primary-button login-submit" type="submit" disabled={pending}>
        {pending ? "Entrando..." : "Entrar no Pipinho"}
      </button>
    </form>
  );
}
