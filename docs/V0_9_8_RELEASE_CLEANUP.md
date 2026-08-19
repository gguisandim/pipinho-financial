# v0.9.8 — API Release Cleanup

Objetivo: congelar o backend validado no Ciclo 9 e separar o laboratório do artefato HTTP de produção antes do frontend.

## Mudanças de runtime

- removidas as rotas HTTP sintéticas `/api/v1/finance/summary` e `/api/v1/ai/*`;
- adicionada `POST /api/v1/assistant`, ligada explicitamente ao Real Financial Agent + Pluggy;
- dashboard e assistant compartilham Bearer auth server-side;
- datas HTTP agora validam calendário real, ordem `startDate <= endDate` e rejeitam parâmetros desconhecidos;
- logs HTTP não registram Item/Account IDs completos;
- factory Groq de produção foi separada do factory multi-provider de laboratório;
- o core `AgenticFinancialService` não importa mais fixtures/tools sintéticas por padrão;
- insights do dashboard recebem cache curto para reduzir custo e rajadas de chamadas à Groq;
- refs de income/savings passam a poder ser expostas à IA apenas quando a própria qualidade do engine autoriza.

## Build/release

- versão: `0.9.8`;
- dependências diretas fixadas em versões exatas;
- `tsconfig.build.json` usa apenas `src/server.ts` como entrypoint;
- `npm start` executa `dist/server.js`;
- `npm run package:api` cria um artefato por whitelist em `release/financial-api`;
- testes, scripts dos ciclos, benchmarks, fixtures e docs permanecem no repositório, mas não entram no release.

## Bash

- `scripts/legacy-runtime-removals.sh`: remoções mínimas das rotas HTTP legadas;
- `scripts/prune-release-only.sh`: lista explícita de itens dev-only que podem ser apagados de uma cópia destinada exclusivamente a release.

Não execute `prune-release-only.sh` no repositório de desenvolvimento se quiser preservar QA/histórico.
