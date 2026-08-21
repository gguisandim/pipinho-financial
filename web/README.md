# Pipinho Web

Frontend V1 em Next.js para o backend `financial-api` deste repositório.

## O que já vem pronto

- dashboard responsivo;
- página de gastos;
- chat com `/api/v1/assistant`;
- insights de IA do dashboard;
- página de conexões alinhada ao estado atual da Pluggy;
- Supabase Auth por e-mail/senha;
- rotas protegidas no Next.js;
- BFF server-side para não expor `DASHBOARD_API_TOKEN` no navegador;
- allowlist opcional de e-mails para uso pessoal.

## Arquitetura

```text
Browser
   ↓ sessão Supabase
Next.js / Vercel
   ├── protege páginas
   ├── protege /api/pipinho/*
   └── injeta FINANCIAL_API_TOKEN no servidor
            ↓
      Fastify Financial API
         ├── Pluggy
         └── Groq
```

O Supabase é usado para **autenticação** e, desde a C11.3, para **memória de conversa**. O extrato bruto da Pluggy continua fora do Postgres.

## 1. Instalar

Dentro de `web/`:

```bash
npm install
cp .env.example .env.local
```

No Windows CMD, você pode copiar manualmente `.env.example` para `.env.local`.

## 2. Criar o autenticador no Supabase

1. Crie um projeto no Supabase.
2. Em **Authentication > Users**, crie manualmente o usuário que terá acesso ao Pipinho.
3. Para um app pessoal, desative novos cadastros públicos nas configurações de Auth.
4. No painel de conexão/API do Supabase, copie:
   - Project URL;
   - Publishable key (ou a anon key durante a transição de chaves).
5. Configure no `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
PIPINHO_ALLOWED_EMAILS=seu-email@exemplo.com
```

`PIPINHO_ALLOWED_EMAILS` é uma segunda barreira da aplicação. Se ficar vazio, qualquer usuário autenticado no mesmo projeto Supabase poderá entrar.

## 3. Apontar para a API financeira

O backend deve estar rodando em outra URL/processo. Localmente:

```env
FINANCIAL_API_URL=http://localhost:3333
FINANCIAL_API_TOKEN=mesmo_valor_do_DASHBOARD_API_TOKEN_do_backend
```

Em produção, `FINANCIAL_API_URL` deve ser a URL pública HTTPS onde o Fastify estiver hospedado.

Não use `NEXT_PUBLIC_` no token financeiro. O browser nunca precisa conhecer esse segredo.

## 4. Rodar localmente

Terminal 1, na raiz do projeto:

```bash
npm install
npm run dev
```

Terminal 2:

```bash
cd web
npm install
npm run dev
```

Abra `http://localhost:3000`.

## 5. Deploy na Vercel

Ao importar o repositório na Vercel:

- Framework Preset: **Next.js**;
- Root Directory: **`web`**;
- Node.js: 22+;
- adicione as variáveis abaixo em Production e Preview conforme necessário:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
PIPINHO_ALLOWED_EMAILS=
FINANCIAL_API_URL=
FINANCIAL_API_TOKEN=
PIPINHO_CHAT_RETENTION_DAYS=365
```

Marque `FINANCIAL_API_TOKEN` como variável sensível na Vercel.

## Sobre o Supabase

A C11.3 adiciona duas tabelas com RLS:

```text
pipinho_chat_sessions
pipinho_chat_messages
```

Aplique `supabase/migrations/20260820031000_c11_3_chat_memory.sql` no **SQL Editor** do mesmo projeto Supabase usado pelo Auth. Cada linha fica vinculada ao `auth.uid()` e as policies impedem que um usuário leia a memória de outro.

A memória salva somente o conteúdo do chat e metadados compactos da resposta. O extrato bruto da Pluggy, IDs internos das contas e resultados completos das tools não são persistidos nessas tabelas.

A retenção padrão é de 365 dias desde a última atualização da conversa:

```env
PIPINHO_CHAT_RETENTION_DAYS=365
```

Use `0` para não expirar automaticamente. A limpeza automática é oportunística: ocorre quando as rotas de conversa são usadas. O usuário também pode excluir uma conversa ou limpar todo o histórico pela interface.

## Ciclo 11 — conversa natural e memória (C11.1 + C11.2 + C11.3)

Na C11.3, o navegador deixou de ser a fonte do histórico. O fluxo agora é:

```text
Browser
  ↓ question + conversationId
Next BFF
  ↓ valida sessão Supabase / RLS
Supabase
  ↓ últimas 10 mensagens
Fastify Agent
  ↓ tools + grounding
Next BFF
  ↓ salva pergunta e resposta
Supabase
```

O backend ainda aceita o campo `history` por compatibilidade com clientes da C11.1/C11.2, mas o frontend C11.3 não o envia. A BFF recupera o contexto pelo Supabase e envia somente até 10 mensagens recentes ao agente.

Além do histórico bruto, a sessão mantém uma `routing_memory` pequena contendo apenas as últimas perguntas do usuário. Ela funciona como fallback de contexto e **não é evidência financeira**. Valores continuam precisando vir de tools executadas no turno atual.

As conversas podem ser retomadas em outro dispositivo desde que o usuário entre com a mesma conta Supabase.

## Ciclo 10 — filtros mensais

A visão geral e a página de gastos usam o mesmo filtro de período. O frontend converte o mês selecionado em `startDate`/`endDate` e repassa o intervalo pelo BFF para a Dashboard API.

- O mês atual é a seleção inicial.
- É possível consultar até 24 meses anteriores ou todo o período disponível.
- Os cards principais do dashboard comparam o mês selecionado ao mês anterior quando houver dados.
- O gráfico de evolução mantém até 12 meses de contexto, mesmo quando os cards estão filtrados para um único mês.
- Insights e maiores despesas respeitam o mesmo período selecionado.
