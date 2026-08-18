# Ciclo 7 — Real Financial Agent

## Objetivo

Trocar a fonte sintética das tools do Agent Loop por dados reais normalizados pelo `PluggyTransactionRepository`, sem enviar o extrato completo ao LLM.

## Arquitetura

```text
Usuário
  ↓
AgenticFinancialService
  ↓
realFinancialToolDefinitions
  ↓
RealFinancialToolExecutor
  ↓
RealFinancialDataService
  ↓
PluggyTransactionRepository
  ↓
Pluggy API
```

O `AgenticFinancialService` continua sendo o mesmo do benchmark. O Ciclo 7 injeta outro catálogo de tools, outro executor e um system prompt específico para dados reais.

## Princípios

1. O LLM nunca recebe as 1.000+ transações completas.
2. `get_cash_flow` devolve liquidez, spending, renda com qualidade e savings com flag de disponibilidade.
3. `savings.available=false` é vinculante: o Agent não pode publicar taxa/valor de poupança.
4. `income.quality=insufficient` impede tratar entradas BANK como renda factual.
5. Pagamento de fatura não é somado novamente ao spending.
6. Detalhes de transações são retornados apenas por tools específicas e limitadas.
7. Comparação por instituição usa `get_spending_by_institution`.

## Tools reais

- `get_financial_period`
- `get_cash_flow`
- `get_income`
- `get_spending_by_category`
- `get_category_transactions`
- `get_largest_expenses`
- `get_spending_by_institution`
- `get_data_capabilities`

## Quality grounding

Além do causal grounding, o Agent agora possui validação determinística para impedir claims incompatíveis com a qualidade do backend.

Exemplo de tool:

```json
{
  "income": { "quality": "insufficient" },
  "savings": {
    "available": false,
    "estimatedSavings": null,
    "estimatedSavingsRatePct": null
  }
}
```

Uma resposta como `Sua taxa de poupança é 40%` é bloqueada e passa por repair antes de chegar ao usuário.

## Execução

```bash
npm run cycle7 -- "Analise meus gastos"
```

OpenRouter:

```bash
npm run cycle7 -- --provider openrouter "Analise meus gastos"
```

Por padrão o CLI não imprime os resultados financeiros completos das tools. Para depuração local explícita:

```bash
npm run cycle7 -- --show-tool-results "Compare meus gastos por instituição"
```

## Testes sugeridos

```bash
npm run cycle7 -- "Analise meu fluxo financeiro"
npm run cycle7 -- "Qual instituição concentrou mais gastos?"
npm run cycle7 -- "Quanto eu economizei?"
npm run cycle7 -- "Qual minha taxa de poupança?"
npm run cycle7 -- "Quais são minhas maiores categorias de gasto?"
npm run cycle7 -- "O que compõe meus gastos de transporte?"
```

Com a qualidade observada no Ciclo 6.4.1, as perguntas de savings/renda devem resultar em indisponibilidade explícita, não em números inventados.

## Critério de conclusão

- Agent usa `PluggyTransactionRepository` em runtime.
- Nenhuma fixture sintética é consultada pelas tools reais.
- Spending mantém proteção anti-dupla-contagem.
- Quality grounding passa para respostas com renda/savings indisponíveis.
- Instituição financeira pode ser consultada sem confundi-la com categoria.
- Extrato completo não é incluído no prompt do LLM.
