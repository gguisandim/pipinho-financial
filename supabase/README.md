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
