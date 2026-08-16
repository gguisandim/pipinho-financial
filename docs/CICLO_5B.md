# Ciclo 5B — Cloud multi-provider benchmark

## Objetivo

Executar o mesmo AgenticFinancialService, as mesmas tools e os mesmos casos contra providers remotos diferentes. A arquitetura permanece provider-agnostic, mas o experimento agora está alinhado ao alvo de deploy web/serverless.

Providers do escopo:

- `groq` — provider principal;
- `openrouter` — provider cloud alternativo, com `openrouter/free` por padrão.

Ollama foi removido do escopo do laboratório porque inferência local não é um requisito do produto nem do futuro deploy.

## Erro Groq corrigido

Foi observado um `tool_use_failed` em que a Groq retornou `failed_generation` malformado para uma função sem argumentos:

```text
{"name": "get_financial_period", "arguments": {"{}"}}
```

A v0.6.1 tenta primeiro JSON normal. Se o envelope estiver malformado, recupera de forma conservadora nome e argumentos. Representações inequívocas de "sem argumentos" viram `{}`. Argumentos ambíguos não são silenciosamente apagados: recebem um sentinela incompatível com os schemas strict para que Zod/guards locais rejeitem a chamada e o agent loop tente novamente.

Além disso, respostas `no_data` passaram a incluir `availablePeriod`. Assim, a pergunta "Quanto gastei em julho?" pode ser respondida depois de `get_cash_flow(julho)` sem uma segunda chamada a `get_financial_period` quando a cobertura temporal já veio no resultado.

## Qualidade != disponibilidade

A v0.6.1 separa quatro estados:

- `completed`: execução normal;
- `model_protocol_error`: o modelo gerou protocolo/tool call irrecuperavelmente inválido; conta contra qualidade;
- `provider_error`: rate limit, autenticação, rede ou 5xx; não reduz accuracy;
- `harness_error`: falha interna do benchmark; não reduz accuracy do modelo.

O resumo agora mostra `providerAvailabilityPct` separadamente de `passRatePct`.

Exemplo: seis casos perfeitos + um 429 devem produzir aproximadamente:

```text
Provider availability: 85.71%
Pass rate:             100%
Tool accuracy:         100%
```

Em contraste, uma tool call malformada irrecuperável continua sendo uma falha do modelo e reduz a qualidade.

## OpenRouter

OpenRouter exige uma API key para a API, inclusive ao usar o roteador gratuito. No `.env`:

```env
OPENROUTER_API_KEY=sua_chave
OPENROUTER_AGENT_MODEL=openrouter/free
OPENROUTER_FINAL_MODEL=openrouter/free
```

O router `openrouter/free` seleciona entre modelos gratuitos e considera os recursos exigidos pela requisição, como tool calling. Como o modelo efetivo pode mudar, o benchmark registra `observedModels`.

Confira readiness:

```bash
npm run providers:check
```

Teste isolado:

```bash
npm run benchmark -- --provider openrouter --case cash-flow-general
```

Comparação:

```bash
npm run benchmark:compare -- --providers groq,openrouter --case cash-flow-general
```

Benchmark completo:

```bash
npm run benchmark:compare -- --providers groq,openrouter
```

## Relatórios

```text
reports/groq/latest.md
reports/openrouter/latest.md
reports/comparison/latest.md
reports/comparison/latest.json
```

As tabelas incluem disponibilidade, qualidade, latência, tokens e erros de protocolo/provider/harness separadamente.
