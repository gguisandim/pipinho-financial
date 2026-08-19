# Ciclo 9 — Production Hardening antes do Dashboard

Objetivo: reduzir erros e variabilidade operacional antes de iniciar o frontend.
Este ciclo não adiciona uma nova superfície funcional financeira.

## Fast path determinístico

Quando o Semantic Tool Router resolve uma única tool com alta confiança, o backend executa a tool diretamente e chama o modelo somente para síntese.

Fluxo:

```
pergunta -> router -> normalizador -> tool -> LLM synthesis -> groundings
```

O agent loop completo continua disponível para intents `general` e consultas com mais de uma tool possível.

Benefícios esperados:

- uma chamada remota a menos por pergunta específica;
- eliminação de chamadas redundantes da mesma tool;
- menos prompt tokens de tool selection;
- menor superfície para erros de tool calling;
- manutenção dos groundings causal, quality, provenance e evidence.

## Soak test

`npm run qa:soak -- --runs 3`

Executa repetidamente os casos de maior valor:

- fluxo geral;
- savings;
- spending de julho;
- comparação junho/julho;
- alimentação em julho.

Métricas:

- semantic pass rate;
- disponibilidade do provider;
- fast-path rate;
- chamadas de tool redundantes;
- repairs determinísticos e via LLM;
- retries de caso;
- latência P50/P95.

O soak falha se observar falha semântica, erro terminal do provider ou chamada redundante da tool esperada.

## Critério para avançar

Antes do dashboard:

1. `npm run qa:precommit` sem FAIL;
2. `npm run qa:agent` com 11/11 PASS;
3. `npm run qa:soak -- --runs 3` sem falha semântica/tool redundante;
4. WARNs de qualidade devem permanecer explicitamente sinalizados, não mascarados.

A limpeza do pacote de API será feita após esse gate, mantendo testes no repositório de desenvolvimento e removendo-os apenas do artefato de produção.
