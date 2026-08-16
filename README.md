# Finance LLM Lab

Laboratório didático para estudar integração entre dados financeiros estruturados, APIs e LLMs.

## Ciclos implementados

- **Ciclo 0:** contrato de dados + fixture sintética + Financial Engine determinístico.
- **Ciclo 1:** primeira chamada à Groq, com resposta textual livre.
- **Ciclo 2:** Structured Outputs + JSON Schema + Zod em runtime.
- **Ciclo 3:** Local Tool Calling: o LLM escolhe funções financeiras e a aplicação executa uma rodada controlada.
- **Ciclo 4:** Agent Loop multi-turno: o modelo pode usar resultados e erros de tools como feedback, corrigir a estratégia e iterar sob limites explícitos.
- **Ciclo 5A:** evaluation harness determinístico para medir tools, argumentos, grounding, latência e tokens.

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
GROQ_AGENT_MAX_ITERATIONS=5
GROQ_AGENT_MAX_TOOL_CALLS=12
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

- Pluggy / Open Finance real
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
GROQ_AGENT_MAX_ITERATIONS=5
GROQ_AGENT_MAX_TOOL_CALLS=12
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
