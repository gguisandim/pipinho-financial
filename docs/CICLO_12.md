# Ciclo 12 — Routine Intelligence

Status: **implementado; aguarda configuração real do Google Calendar e gate `qa:cycle12:full`.**

## Objetivo

Adicionar rotina ao contexto do Pipinho sem transformar o calendário em evidência financeira causal.

O princípio fica:

**Google Calendar informa compromissos → Pluggy informa fatos financeiros → tools combinam apenas janelas temporais → LLM interpreta → groundings financeiros continuam ativos.**

## C12.1 — Conexão Google Calendar

Implementado OAuth 2.0 separado da autenticação principal do Pipinho. O usuário pode continuar entrando com e-mail/senha no Supabase e conectar o Google Calendar depois.

Escopo solicitado:

```text
https://www.googleapis.com/auth/calendar.readonly
```

A integração é somente leitura.

Rotas Next/BFF:

```text
GET    /api/pipinho/calendar/connect
GET    /api/pipinho/calendar/callback
GET    /api/pipinho/calendar
POST   /api/pipinho/calendar/sync
DELETE /api/pipinho/calendar
```

O refresh token do Google:

- nunca vai ao navegador;
- é criptografado com AES-256-GCM;
- fica em tabela separada;
- só é acessado pelo servidor via `SUPABASE_SERVICE_ROLE_KEY`.

## C12.2 — Snapshot de rotina

Migration:

```text
supabase/migrations/20260820180000_c12_google_calendar_routine.sql
```

Tabelas:

```text
pipinho_calendar_connections   metadados da conexão
pipinho_calendar_credentials   refresh token criptografado, server-only
pipinho_calendar_events        snapshot mínimo dos compromissos
```

Os eventos guardam somente o necessário para contexto:

- título;
- local;
- início/fim;
- data civil do calendário;
- evento de dia inteiro;
- status de presença;
- identificadores de sincronização.

Descrições longas, anexos e conteúdo de terceiros não entram no contexto do LLM.

A sincronização padrão cobre 30 dias anteriores e 90 dias futuros e pode ser ajustada por env. Ao usar o assistente, um snapshot com mais de 15 minutos é atualizado automaticamente de forma best-effort; se o Google falhar, o Pipinho preserva o último snapshot em vez de derrubar a conversa.

## C12.3 — Tools de rotina

### `get_routine_schedule`

Responde agenda, horários e locais.

Exemplos:

```text
O que eu tenho hoje?
Onde eu vou amanhã?
Que horas é minha reunião amanhã?
Como está minha agenda na próxima semana?
Tenho algo no fim de semana?
```

### `get_next_commitment`

Para:

```text
Qual meu próximo compromisso?
Pra onde vou depois?
```

### `get_event_day_spending`

Localiza um compromisso e consulta `get_spending_summary` no mesmo dia ou intervalo do evento.

Exemplo:

```text
Quanto eu gastei no dia da reunião?
```

A resposta recebe explicitamente:

```text
association = same_calendar_window_not_causal
```

Portanto o Pipinho pode dizer “foram observados R$ X em gastos naquele dia”, mas **não** “você gastou R$ X por causa da reunião”. Aprender custo típico por rotina pertence ao Ciclo 13.

## C12.4 — Linguagem temporal futura

O normalizador agora entende também:

- amanhã;
- depois de amanhã;
- próxima semana / semana que vem;
- fim de semana / fds;
- próximos N dias.

Uma consulta genérica como “minha agenda” usa por política uma janela de hoje + 7 dias.

## Frontend

Nova página:

```text
/rotina
```

Ela permite:

- conectar o Google Calendar;
- sincronizar;
- visualizar compromissos;
- desconectar e apagar snapshots;
- verificar quando ocorreu a última sincronização.

Também foi adicionada a seção `Rotina` na navegação e perguntas de calendário nas sugestões do chat.

## Configuração local

### 1. Supabase

Execute a migration C12 no SQL Editor.

Além das variáveis existentes, coloque em `web/.env.local`:

```env
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3000/api/pipinho/calendar/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=
PIPINHO_CALENDAR_PAST_DAYS=30
PIPINHO_CALENDAR_FUTURE_DAYS=90
PIPINHO_CALENDAR_AUTO_SYNC_MINUTES=15
```

Gere a chave de criptografia:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Nunca use `NEXT_PUBLIC_` na service role, client secret ou encryption key.

### 2. Google Cloud

1. Crie ou escolha um projeto no Google Cloud.
2. Ative **Google Calendar API**.
3. Configure a OAuth consent screen.
4. Adicione o escopo `calendar.readonly`.
5. Crie um OAuth Client do tipo **Web application**.
6. Adicione como redirect URI local:

```text
http://localhost:3000/api/pipinho/calendar/callback
```

7. Para Vercel, adicione também:

```text
https://SEU-DOMINIO/api/pipinho/calendar/callback
```

8. Copie Client ID e Client Secret para as variáveis do frontend server-side.

O fluxo pede `access_type=offline` e `prompt=consent` para obter refresh token. Apps públicos que usam escopos do Google podem precisar cumprir o processo de verificação do Google; para desenvolvimento mantenha os usuários de teste configurados na tela de consentimento.

## Vercel

No projeto com Root Directory `web`, configure as mesmas variáveis de C12. Em produção, `GOOGLE_CALENDAR_REDIRECT_URI` precisa apontar para o domínio definitivo e o mesmo endereço precisa estar autorizado no Google Cloud.

## QA

Local:

```bash
npm run qa:routine
npm run qa:cycle12
```

Com Groq + Pluggy reais:

```bash
npm run qa:routine:real
npm run qa:cycle12:full
```

Critério de fechamento:

- backend typecheck passa;
- C11 continua sem regressão;
- routing e tools de rotina passam;
- frontend typecheck/build passam;
- audit real usa as tools esperadas e mantém grounding financeiro;
- causal grounding rejeita frases que transformem coincidência temporal em gasto causado pelo evento;
- conexão real Google Calendar sincroniza e a página `/rotina` exibe os eventos.

## Fora de escopo do C12

- inferir que um gasto foi causado por um compromisso;
- aprender automaticamente custo médio de UFPA/trabalho/academia;
- alertas proativos;
- WhatsApp/n8n;
- criação/edição de eventos pelo Pipinho.

Esses pontos entram nos ciclos seguintes.
