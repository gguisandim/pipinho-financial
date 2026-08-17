# Finance LLM Lab

Laboratório didático para estudar integração entre dados financeiros estruturados, APIs e LLMs.

## Ciclos implementados

- **Ciclo 0:** contrato de dados + fixture sintética + Financial Engine determinístico.
- **Ciclo 1:** primeira chamada à Groq, com resposta textual livre.
- **Ciclo 2:** Structured Outputs + JSON Schema + Zod em runtime.
- **Ciclo 3:** Local Tool Calling: o LLM escolhe funções financeiras e a aplicação executa uma rodada controlada.
- **Ciclo 4:** Agent Loop multi-turno: o modelo pode usar resultados e erros de tools como feedback, corrigir a estratégia e iterar sob limites explícitos.
- **Ciclo 5A:** evaluation harness determinístico para medir tools, argumentos, grounding, latência e tokens.
- **Ciclo 5B:** abstração multi-provider cloud e comparação Groq × OpenRouter.
- **Ciclo 6.1:** autenticação Pluggy server-side + cache da API Key.
- **Ciclo 6.2:** leitura real de Items, Accounts e Transactions com paginação por cursor.
- **Ciclo 6.3:** `TransactionRepository` + mapper Pluggy → domínio, preservando BANK/CREDIT, status, origem e evidência de categoria.

Princípio arquitetural:

> **o backend calcula; o LLM escolhe como consultar e interpreta; contratos validam a fronteira.**

## Requisitos

- Node.js 22+
- conta na Groq
- API key da Groq

## Instalação

```bash
npm install
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

CMD:

```cmd
copy .env.example .env
```

Preencha `.env`:

```env
PORT=3333
GROQ_API_KEY=sua_chave
GROQ_MODEL=openai/gpt-oss-20b
GROQ_STRUCTURED_MODEL=openai/gpt-oss-20b
GROQ_TOOL_MODEL=openai/gpt-oss-20b
GROQ_FINAL_MODEL=openai/gpt-oss-20b
GROQ_AGENT_MODEL=openai/gpt-oss-20b
AGENT_MAX_ITERATIONS=5
AGENT_MAX_TOOL_CALLS=12
```

Nunca versione `.env`.

> Nota histórica: o baseline original do Ciclo 1 foi executado com `llama-3.1-8b-instant`. A configuração nova usa `openai/gpt-oss-20b` para evitar depender desse modelo antigo.

## Ciclo 0

```bash
npm run cycle0
npm test
```

Valores esperados:

- receitas: R$ 5.650,00
- despesas: R$ 2.804,36
- fluxo líquido: R$ 2.845,64
- savings rate: 50,37%

## Ciclo 1 — texto livre

```bash
npm run cycle1 -- "Analise meu fluxo financeiro"
```

Arquitetura:

```text
FinancialSummary completo
       ↓
      LLM
       ↓
     string
```

## Ciclo 2 — Structured Outputs

```bash
npm run cycle2 -- "Quanto tenho investido?"
```

Arquitetura:

```text
FinancialSummary completo
       ↓
      LLM
       ↓
JSON Schema estrito
       ↓
      Zod
       ↓
objeto TypeScript
```

## Ciclo 3 — Local Tool Calling

```bash
npm run cycle3 -- "Analise meu fluxo financeiro"
```

A principal mudança é que o LLM **não recebe o resumo financeiro completo antes de decidir o que precisa**.

```text
Pergunta
   ↓
LLM + schemas das tools
   ↓
tool_calls
   ↓
JSON.parse + Zod.parse
   ↓
Financial Engine local
   ↓
resultado das tools
   ↓
LLM
   ↓
resposta final
```

Tools disponíveis:

- `get_financial_period`
- `get_cash_flow`
- `get_income`
- `get_spending_by_category`
- `get_largest_expenses`
- `get_data_capabilities`

A aplicação imprime para cada chamada:

- nome da tool escolhida;
- argumentos gerados pelo LLM;
- resultado retornado pelo backend;
- resposta final;
- latência e tokens do planejamento;
- latência e tokens da resposta final;
- totais.

### Benchmark recomendado

```bash
npm run cycle3 -- "Quanto gastei em julho?"
npm run cycle3 -- "Quanto tenho investido?"
npm run cycle3 -- "Eu gastei mais no Nubank ou no Itaú?"
npm run cycle3 -- "Qual foi minha maior categoria de gastos e por quê?"
npm run cycle3 -- "Analise meu fluxo financeiro"
```

O que observar:

1. a tool escolhida é semanticamente correta?
2. os argumentos estão corretos?
3. o backend devolve o valor esperado?
4. a resposta final usa somente o que as tools forneceram?
5. o modelo chama tools demais ou de menos?

## API

```bash
npm run dev
```

Endpoints:

```text
GET  /
GET  /health
GET  /api/v1/finance/summary
POST /api/v1/ai/explain-summary
POST /api/v1/ai/structured-analysis
POST /api/v1/ai/tool-analysis
POST /api/v1/ai/agent-analysis
```

PowerShell para o Ciclo 3:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:3333/api/v1/ai/tool-analysis" `
  -ContentType "application/json" `
  -Body '{"question":"Analise meu fluxo financeiro"}'
```

## Testes

```bash
npm test
npm run typecheck
```

Os testes do Ciclo 3 verificam, sem chamar LLM:

- `no_data` para julho;
- maior categoria determinística;
- capabilities ausentes;
- validação de argumentos das tools;
- rejeição de data inválida;
- rejeição de tool desconhecida.

## Limite proposital do Ciclo 3

Ele executa **uma rodada** de tools:

```text
LLM -> tool(s) -> LLM -> resposta
```

A primeira chamada pode solicitar várias tools em paralelo. Depois dessa rodada, o Ciclo 3 faz uma síntese em uma chamada nova e limpa, sem histórico `assistant.tool_calls`/`role=tool`. Isso evita o HTTP 400 observado quando o modelo tenta continuar chamando ferramentas num turno sem tools disponíveis.

Ainda não existe o comportamento:

```text
LLM
 ↓
tool A
 ↓
resultado A
 ↓
LLM percebe que precisa da tool B
 ↓
tool B
 ↓
...
```

Esse comportamento foi implementado no **Ciclo 4: Agent Loop**.

## Ainda fora do escopo

- PostgreSQL
- autenticação
- RAG
- embeddings
- LangChain
- memória de conversa
- forecasting

## Ciclo 4 — Agent Loop

O Ciclo 4 permite múltiplas rodadas de tool calling e adiciona guardrails determinísticos contra datas inventadas, argumentos inválidos, chamadas duplicadas e loops sem fim.

```bash
npm run cycle4 -- "Analise meu fluxo financeiro"
```

Endpoint:

```text
POST /api/v1/ai/agent-analysis
```

Configuração principal:

```env
GROQ_AGENT_MODEL=openai/gpt-oss-20b
AGENT_MAX_ITERATIONS=5
AGENT_MAX_TOOL_CALLS=12
```

Veja `docs/CICLO_4.md`.

## Ciclo 5A — Evaluation Harness

O Ciclo 5A transforma o benchmark manual dos ciclos anteriores em uma suíte executável.

```bash
npm run benchmark
```

Métricas:

- tool selection accuracy;
- argument accuracy;
- causal grounding;
- requisitos mínimos da resposta;
- pass rate;
- iterações e tool calls médias;
- latência média, P50 e P95;
- tokens médios e totais.

O agente também ganhou uma camada de **causal grounding**. Respostas que introduzem generalizações ou detalhes não retornados pelas tools são detectadas deterministicamente e passam por uma etapa de reparo antes de chegar ao usuário.

Para inspecionar um único caso:

```bash
npm run benchmark -- --case largest-category-causal
```

Para múltiplas repetições:

```bash
npm run benchmark -- --runs 3
```

Veja `docs/CICLO_5A.md`.


## v0.5.1 — progresso do benchmark

O benchmark completo agora exibe o caso em execução, resultado, latência/tokens e a pausa entre casos. Isso evita que a espera de rate-limit pareça um travamento.

```bash
npm run benchmark
```

Para testes rápidos de um caso, use `--case`. O `--delay-ms` pode ser reduzido manualmente, mas valores muito baixos podem atingir o limite gratuito do provider.

## v0.6.1 — Ciclo 5B cloud-only + robustez de tool calling

O Ciclo 5B agora compara somente providers compatíveis com o alvo de deploy web:

```bash
npm run benchmark -- --provider groq
npm run benchmark -- --provider openrouter
npm run benchmark:compare -- --providers groq,openrouter
```

Ollama foi removido do escopo principal. A abstração `LlmProvider`/`ToolCallingLlmProvider` permanece, mas o benchmark agora representa o cenário que poderá ser usado em Vercel: inferência remota via API.

### Correções da v0.6.1

1. **Groq `tool_use_failed` malformado:** `failed_generation` agora possui recuperação tolerante. O caso observado `{"name":"get_financial_period","arguments":{"{}"}}` é normalizado para uma chamada sem argumentos, sem derrubar o processo.
2. **`no_data` autocontido:** consultas sem dados devolvem `availablePeriod`; o agente não precisa chamar `get_financial_period` novamente quando a cobertura temporal já estiver presente.
3. **Falhas externas separadas de qualidade:** rate limit, rede e indisponibilidade do provider não zeram mais tool/argument/grounding accuracy. O relatório separa `provider availability`, `provider errors`, `model protocol errors` e `harness errors`.
4. **OpenRouter sem stack trace:** se `OPENROUTER_API_KEY` estiver ausente, o CLI informa a configuração necessária e encerra sem iniciar benchmark.
5. **Evaluator semântico/numérico:** formatos monetários e frases semanticamente equivalentes continuam sendo normalizados antes do scoring.

### OpenRouter

A API do OpenRouter exige API key mesmo para modelos gratuitos. Configure:

```env
OPENROUTER_API_KEY=sua_chave
OPENROUTER_AGENT_MODEL=openrouter/free
OPENROUTER_FINAL_MODEL=openrouter/free
```

Verifique os providers antes do benchmark:

```bash
npm run providers:check
```

Depois:

```bash
npm run benchmark -- --provider openrouter --case cash-flow-general
npm run benchmark:compare -- --providers groq,openrouter --case cash-flow-general
```

`openrouter/free` pode selecionar modelos diferentes entre chamadas. O relatório registra `observedModels`; para uma comparação científica por modelo, configure depois um ID fixo compatível com tools.

### Métricas do benchmark

Qualidade e disponibilidade agora são dimensões separadas:

```text
Provider availability
Pass rate
Tool selection accuracy
Argument accuracy
Grounding accuracy
Semantic answer accuracy
Numeric answer accuracy
Model protocol errors
Provider errors
Harness errors
Latency
Tokens
```

Veja `docs/CICLO_5B.md`.


## Ciclo 6.1 — Pluggy authentication

Autenticação server-side com `POST https://api.pluggy.ai/auth`, cache temporário da API Key e proteção para não expor credenciais.

```bash
npm run cycle6:1
```

Veja `docs/CICLO_6_1.md`.

## Ciclo 6.2 — dados reais Pluggy

A Pluggy não oferece endpoint para listar Items existentes. Persistimos os `itemId` das autorizações MeuPluggy no `.env`:

```env
PLUGGY_ITEM_IDS=<nubank-item-id>,<neon-item-id>,<picpay-item-id>
PLUGGY_ITEM_LABELS=Nubank,Neon,PicPay
```

Depois:

```bash
npm run cycle6:2
```

O script executa, sem LLM:

```text
GET /items/{id}
    ↓
GET /accounts?itemId=...
    ↓
GET /v2/transactions?accountId=...
    ↓
segue `next` até o fim
```

Por padrão IDs, números de conta, saldos e amostras sensíveis são mascarados/ocultados. Veja `docs/CICLO_6_2.md`.


## Ciclo 6.3 — Repository + Mapper

```bash
npm run cycle6:3
```

O script lê os mesmos Items do Ciclo 6.2, converte as transações para o domínio da aplicação e imprime apenas métricas de mapeamento. Valores monetários não são exibidos.

```text
Pluggy Transaction
       ↓
PluggyTransactionMapper
       ↓
Domain Transaction
       ↓
TransactionRepositorySnapshot
```

O domínio preserva `metadata.role` (`bank_inflow`, `bank_outflow`, `card_purchase`, `card_credit`) porque o Financial Engine ainda não deve somar conta e cartão ingenuamente. Essa separação será usada no Ciclo 6.4 para evitar dupla contagem de compras e pagamentos de fatura.
