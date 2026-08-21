# Financial API

Backend TypeScript/Fastify para organizar dados financeiros reais da Pluggy, calcular métricas de forma determinística e oferecer uma camada de IA guardada para dashboard e assistente.

## Arquitetura atual

```text
Pluggy
  ↓
PluggyTransactionRepository
  ↓
Financial Engine
  ↓
RealFinancialDataService
  ├── DashboardDataService
  │    └── DashboardInsightService
  └── Real Financial Agent
       └── causal + quality + provenance + evidence grounding
```

Princípio: **o backend calcula; o LLM interpreta; os guards verificam a evidência.**

## Desenvolvimento

Requisitos:

- Node.js 22+
- credenciais Pluggy
- API key da Groq

```bash
npm ci
cp .env.example .env
npm run dev
```

## API HTTP

Rotas públicas de infraestrutura:

```text
GET /              metadados da API
GET /health        healthcheck
```

Rotas protegidas por `Authorization: Bearer <DASHBOARD_API_TOKEN>`:

```text
GET  /api/v1/dashboard/overview
GET  /api/v1/dashboard/series/monthly
GET  /api/v1/dashboard/spending/categories
GET  /api/v1/dashboard/spending/institutions
GET  /api/v1/dashboard/expenses/largest
GET  /api/v1/dashboard/quality
GET  /api/v1/dashboard/capabilities
POST /api/v1/dashboard/ai/insights
POST /api/v1/assistant
```

As rotas sintéticas dos ciclos iniciais foram removidas do runtime HTTP.

## Segurança

- `PLUGGY_CLIENT_SECRET`, `GROQ_API_KEY` e `DASHBOARD_API_TOKEN` são server-side.
- respostas do dashboard não incluem o extrato cru;
- IDs de Item/Account são mascarados em mensagens de erro;
- datas e parâmetros HTTP são validados estritamente;
- o assistente usa somente o Real Financial Agent sobre dados Pluggy normalizados;
- métricas de renda/savings permanecem indisponíveis quando a evidência é insuficiente.

## Atualização sobre versões antigas

Se o projeto for atualizado extraindo um ZIP por cima de uma pasta existente, arquivos removidos em versões novas podem permanecer fisicamente no Windows. Antes de typecheck/build, a versão atual executa automaticamente `npm run clean:stale`, que remove apenas arquivos legados conhecidos.

Você também pode executar manualmente:

```bash
npm run clean:stale
```

Isso evita que rotas antigas como `src/routes/ai.routes.ts` voltem a ser compiladas apenas porque sobraram no diretório.

## Quality gates

```bash
npm run qa:precommit
npm run qa:agent
npm run qa:soak -- --runs 5
```

Os testes permanecem no repositório de desenvolvimento e **não** entram no pacote de produção.

## Build de produção

```bash
npm run build
npm run start:prod
```

O build usa `tsconfig.build.json` com `src/server.ts` como único entrypoint. Assim scripts históricos, testes e módulos não alcançados pelo servidor não são emitidos em `dist/`.

## Gerar artefato limpo da API

```bash
npm run package:api
```

Gera uma pasta e, no Windows, também tenta gerar um ZIP de release. O script imprime o caminho absoluto ao terminar:

```text
release/financial-api/
├── dist/
├── package.json
├── package-lock.json
├── .env.example
└── README.md
```

Também grava `release/RELEASE_PATH.txt` com o caminho resolvido.

Para validar o artefato:

```bash
cd release/financial-api
npm ci --omit=dev
npm start
```

O script `scripts/prune-release-only.sh` documenta em Bash os diretórios e arquivos que não pertencem a um release final. Prefira `npm run package:api` porque ele cria o pacote por whitelist, sem apagar arquivos do repositório.

## Histórico do laboratório

A documentação dos ciclos anteriores foi preservada em `docs/LAB_HISTORY.md`, mas não faz parte do artefato de produção.

## Frontend V1 (`web/`)

O repositório agora inclui um frontend Next.js separado em `web/`, com dashboard, gastos, assistente e autenticação Supabase preparada para Vercel.

A separação é intencional: o pacote de release da API continua por whitelist e não leva o frontend junto.

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

Detalhes de autenticação e deploy: [`web/README.md`](web/README.md).

## Ciclo 12 — Rotina (`/rotina`)

O frontend também pode conectar um Google Calendar em modo somente leitura. O calendário é sincronizado para um snapshot mínimo no Supabase e passa ao agente apenas por um contexto confiável criado no BFF; o browser não escolhe nem injeta eventos no payload do backend.

A integração permite consultar agenda, próximo compromisso e gastos observados na mesma janela de um evento. Coincidência temporal nunca é tratada como causalidade financeira.

Configuração, migration, OAuth e QA: [`docs/CICLO_12.md`](docs/CICLO_12.md).
