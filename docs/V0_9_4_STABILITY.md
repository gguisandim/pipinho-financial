# v0.9.4 — Stability / Tool Quality Gate

Esta revisão fecha problemas encontrados pela matriz real da v0.9.3 antes do dashboard Next.js.

## Correções

- Corrige fixture do DashboardDataService: a transação `charge-aug` em 2026-08-08 faz parte do período disponível; o teste antigo esperava 2026-08-07.
- Adiciona retry exponencial para Groq somente em falhas transitórias: rede, 429 e 5xx. Erros de protocolo/modelo 400 continuam visíveis e não são mascarados.
- O QA Agent faz uma única repetição de caso quando, mesmo após os retries do provider, houver erro transitório; o resultado informa `PASS_WITH_RETRY` e `caseRetries`.
- O QA Agent passa a imprimir qual grounding falhou e os primeiros fragments, em vez de apenas `grounding=false`.
- Normalização determinística de argumentos de tools para perguntas temporais simples: mês nomeado, ano explícito e grupo `alimentação`.
- Evidence grounding aceita arredondamento de apresentação compatível com a precisão exibida, sem aceitar números materialmente diferentes.
- Regra de encargos financeiros pode refinar uma categoria Pluggy genérica `other` quando a descrição identifica inequivocamente juros/IOF/multa/crédito rotativo.

## Comandos de validação

```bash
npm run qa:precommit
npm run qa:agent
```

Para investigar somente tools/grounding:

```bash
npm run qa:tools
npm run qa:critical
```

O `qa:agent` continua sendo exploratório e dependente do provider remoto; indisponibilidade transitória é separada de falha semântica.
