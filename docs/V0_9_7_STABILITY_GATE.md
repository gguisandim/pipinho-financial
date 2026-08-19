# v0.9.7 — Stability Gate

Objetivo: reduzir falhas semânticas observadas no soak test antes do próximo ciclo funcional.

## Mudanças

- Fast path executa a tool deterministicamente e usa o provider textual simples apenas para síntese; schemas de tool não são reexpostos ao modelo.
- Prompt de síntese reduzido e evidence-first, com rótulos canônicos de categorias.
- Evidence sanitizer remove também linhas de breakdown sem sustentação mesmo quando o número coincide com outra métrica válida.
- Soak test imprime diagnóstico de grounding e trecho da resposta quando houver FAIL.
- QA agent usa 2026-08-19 como data de referência desta rodada.

## Critérios para avançar

- `qa:precommit`: zero FAIL.
- `qa:agent`: 11/11 PASS.
- `qa:soak -- --runs 5`: 100% semantic pass, 100% provider availability, zero tool calls redundantes.
- Latência é observada separadamente; P95 alto do provider é WARN, não falha de integridade.
