# v0.9.3 — Tool Quality, Evidence Grounding e Taxonomia

Esta versão estabiliza o Agent depois do quality gate da v0.9.2.

## Problemas encontrados pelo QA real

A v0.9.2 confirmou que o núcleo determinístico estava íntegro, mas revelou três classes de problema no Agent:

1. uma pergunta sobre taxa de poupança podia ser roteada para `get_data_capabilities` em vez de consultar o status financeiro da métrica;
2. respostas podiam incluir números ou breakdowns que não estavam presentes em nenhuma tool executada, como uma tabela ilustrativa de categorias;
3. juros, IOF, multa e crédito rotativo permaneciam em `other`, embora possuam semântica financeira conhecida.

## Semantic Tool Routing

Antes de cada chamada ao modelo, o backend reduz o catálogo de tools conforme a intenção observável da pergunta.

Exemplos:

```text
"Qual minha taxa de poupança?"
  -> get_savings_status

"Quanto gastei em julho?"
  -> get_spending_summary

"Analise meu fluxo financeiro"
  -> get_cash_flow

"Como meus gastos evoluíram mês a mês?"
  -> get_monthly_financial_trend
```

O LLM ainda preenche argumentos e interpreta o resultado, mas deixa de escolher entre tools irrelevantes para perguntas com intenção clara. Isso reduz superfície de erro e quantidade de schemas enviados ao provider.

## Tools dedicadas

A API interna do Agent agora inclui:

- `get_spending_summary`: total de spending sem carregar informações de renda/savings desnecessárias;
- `get_savings_status`: status da poupança e da qualidade de renda, respeitando `available=false`;
- `get_monthly_financial_trend`: série mensal para dashboard, tendência e comparação temporal.

`get_data_capabilities` fica reservado a dimensões ainda não integradas, como saldo atual, investimentos, empréstimos e projeção de fatura.

`get_spending_by_category` também aceita `categoryGroup="food"` para perguntas amplas sobre alimentação. O total é calculado no backend como `groceries + food_delivery + restaurants`, evitando delegar uma soma financeira ao LLM.

## Evidence Grounding

Além de causal, quality e provenance grounding, o Agent possui uma quarta camada determinística:

```text
causal
quality
provenance
evidence
```

O evidence grounding valida duas coisas:

- valores em R$ e percentuais precisam existir nos resultados de tools executadas;
- breakdowns de categoria, instituição e mês exigem a tool correspondente.

Os números são comparados por unidade. Uma contagem `3` não autoriza o Agent a afirmar `R$ 3,00`.

Se a resposta criar uma seção numérica sem evidência, o sanitizer remove essa seção/linha sem fazer uma nova chamada ao LLM.

## financial_charges

A taxonomia ganhou a categoria canônica `financial_charges` para itens como:

- juros;
- IOF;
- multa por atraso;
- juros de mora;
- crédito rotativo;
- tarifas/encargos financeiros reconhecíveis.

A classificação é determinística quando a descrição/provider category fornece evidência clara. Tributos genéricos não são automaticamente tratados como encargos financeiros.

## Qualidade de categoria: quantidade x valor

A v0.9.2 mostrava `otherSpendingPct` com base na quantidade de transações, embora o dashboard tratasse a métrica como cobertura monetária. Agora há métricas distintas:

- `otherSpendingTransactionPct`: participação de `other` por quantidade de transações;
- `otherSpendingAmountPct`: participação de `other` no valor bruto de spending;
- `financialChargesPct`: participação dos encargos financeiros no valor bruto de spending.

Signals e quality gate do dashboard usam `otherSpendingAmountPct` para falar de cobertura monetária. Cards de IA sobre encargos podem sugerir a ação fechada `open_financial_charges`, permitindo que o futuro frontend leve o usuário diretamente à categoria correspondente.

## QA recomendado

```bash
npm run qa:local
npm run qa:critical
npm run qa:tools
npm run qa:real
npm run qa:dashboard
npm run dashboard:check
npm run qa:precommit
npm run qa:agent
# ou, incluindo o benchmark remoto:
npm run qa:full
```

O `qa:agent` continua exploratório porque depende de um provider remoto, mas agora valida onze intenções e também exige `grounding.evidence.passed=true`.
