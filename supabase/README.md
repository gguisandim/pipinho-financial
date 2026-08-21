# Supabase — Pipinho Finance

O Supabase começou apenas como autenticação. A partir da C11.3 ele também persiste a memória de conversa do usuário autenticado.

## Aplicar a C11.3

No Dashboard do mesmo projeto Supabase usado em `web/.env.local`:

1. abra **SQL Editor**;
2. crie uma nova query;
3. cole o conteúdo de `supabase/migrations/20260820031000_c11_3_chat_memory.sql`;
4. execute uma vez.

Se o projeto estiver vinculado ao Supabase CLI, a migration também pode ser aplicada pelo fluxo normal de migrations.

## Segurança

As tabelas usam RLS. Cada linha possui `user_id` e as policies permitem acesso apenas quando `user_id = auth.uid()`.

A memória salva perguntas e respostas do chat, mas não armazena o extrato bruto da Pluggy nem resultados completos das tools.

## Aplicar a C12 — Google Calendar / Rotina

Depois da migration da C11.3, execute também:

```text
supabase/migrations/20260820180000_c12_google_calendar_routine.sql
```

Ela cria três tabelas:

- `pipinho_calendar_connections`: metadados da conexão;
- `pipinho_calendar_credentials`: refresh token do Google criptografado e server-only;
- `pipinho_calendar_events`: snapshot mínimo dos compromissos.

A tabela de credenciais não possui policy nem grant para `authenticated`. O frontend server-side acessa essa tabela somente com `SUPABASE_SERVICE_ROLE_KEY`, que nunca deve usar prefixo `NEXT_PUBLIC_`.

A lista de eventos pode ser lida apenas pelo próprio usuário via RLS (`auth.uid() = user_id`). Escritas e sincronização ficam restritas ao servidor.
