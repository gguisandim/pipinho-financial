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

O Supabase, nesta V1, é usado **somente para autenticação**. Não é necessário criar tabelas nem copiar transações financeiras para o Postgres.

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
```

Marque `FINANCIAL_API_TOKEN` como variável sensível na Vercel.

## Sobre o Supabase

Para a arquitetura atual, **não há migration SQL obrigatória**. O Supabase não armazena o extrato e não participa da lógica financeira.

Quando o projeto virar multiusuário, aí vale adicionar algo como:

```text
profiles
financial_connections (user_id → pluggy_item_id)
chat_sessions
chat_messages
user_preferences
```

Antes disso, adicionar essas tabelas só aumentaria a superfície do sistema sem necessidade.

## Ciclo 11 — contexto conversacional curto

O endpoint do assistente agora aceita `conversationId` e até 10 mensagens anteriores:

```json
{
  "question": "E mês passado?",
  "conversationId": "...",
  "history": [
    { "role": "user", "content": "Quanto eu gastei este mês?" },
    { "role": "assistant", "content": "..." }
  ]
}
```

Isso permite follow-ups curtos sem transformar o histórico em fonte de verdade financeira. Números continuam precisando ser sustentados por tools executadas na resposta atual. A persistência das conversas no Supabase ainda não foi implementada; nesta etapa o contexto vive na sessão aberta do chat.

## Ciclo 10 — filtros mensais

A visão geral e a página de gastos usam o mesmo filtro de período. O frontend converte o mês selecionado em `startDate`/`endDate` e repassa o intervalo pelo BFF para a Dashboard API.

- O mês atual é a seleção inicial.
- É possível consultar até 24 meses anteriores ou todo o período disponível.
- Os cards principais do dashboard comparam o mês selecionado ao mês anterior quando houver dados.
- O gráfico de evolução mantém até 12 meses de contexto, mesmo quando os cards estão filtrados para um único mês.
- Insights e maiores despesas respeitam o mesmo período selecionado.
