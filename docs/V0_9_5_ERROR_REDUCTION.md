# v0.9.5 — Error Reduction Gate

Esta versão não adiciona um novo ciclo funcional. Ela corrige regressões e falsos positivos observados no QA da v0.9.4 antes de iniciar o dashboard visual.

## Correções

- Corrige o typecheck de `audit-agent.ts`: groundings diferentes usam `sentence` ou `fragment`, e o diagnóstico agora trata ambos de forma segura.
- Corrige falso positivo `unsupported_monthly_breakdown`: uma resposta factual sobre um único mês pode ser sustentada por `get_spending_summary` ou `get_spending_by_category` com intervalo daquele mês. `get_monthly_financial_trend` continua obrigatório para séries, tendências e comparação entre dois ou mais meses.
- Canoniza perguntas sobre mês civil completo. `"em julho"` sempre vira `01/07 → 31/07`, mesmo se o provider gerar um intervalo parcial.
- Canoniza comparações explícitas entre meses. `"julho ou junho"` vira uma única chamada mensal `01/06 → 31/07`, `months=2`.
- O prompt orienta o Agent a não repetir a tool mensal quando a resposta já contém todos os meses solicitados.
- O QA Agent separa repair determinístico de repair por LLM; sanitizers locais deixam de ser tratados como custo/instabilidade de provider.

## Critério para avançar

Antes de iniciar o Ciclo 9:

1. `npm run qa:precommit` deve terminar sem FAIL.
2. `npm run qa:agent` deve chegar a 11/11 semanticamente corretos. `PASS_WITH_RETRY` é aceitável, mas deve ser registrado como disponibilidade do provider.
3. As perguntas de julho e alimentação em julho não podem gerar `unsupported_monthly_breakdown`.
4. A comparação junho/julho deve usar uma única execução de `get_monthly_financial_trend` sempre que o provider seguir o plano normalizado.

## Produção / limpeza da API

Os testes permanecem no repositório durante a estabilização. Na etapa de release, a API será empacotada separadamente: `dist/` + dependências de runtime + configuração necessária. `tests/`, scripts de ciclos, benchmarks e dependências de desenvolvimento não devem ir para o artefato de produção; não é necessário apagar os testes do repositório para obter uma API limpa.
