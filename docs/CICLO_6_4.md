# Ciclo 6.4 — Financial Engine real: liquidez, receita e spending

## Objetivo

Usar as transações normalizadas do `PluggyTransactionRepository` sem enviar dados ao LLM e evitar a principal armadilha de agregadores financeiros: contar uma compra no cartão e o posterior pagamento da fatura como duas despesas.

## Por que uma única soma não funciona

Contas BANK e CREDIT possuem semânticas diferentes. Uma compra no cartão representa consumo, enquanto o pagamento da fatura representa liquidação financeira dessa dívida. Somar ambos em `totalExpenses` duplica o mesmo evento econômico.

O Ciclo 6.4 cria views independentes:

```text
Domain Transactions
       ↓
Movement Classifier
       ├── Liquidity View
       ├── Income View
       └── Spending View
                ↓
          Savings Estimate
```

### Liquidity View

Usa movimentos de contas BANK. Exclui transferências de mesma titularidade da visão consolidada, mas mantém pagamentos de fatura e movimentos de investimento porque eles efetivamente alteram o caixa bancário.

### Spending View

Inclui:

- `bank_outflow` de consumo;
- `card_purchase`.

Exclui:

- transferências de mesma titularidade;
- pagamentos de fatura;
- movimentos de investimento;
- empréstimos/financiamentos tratados como movimentos financeiros nesta versão.

Estornos/cashbacks claramente identificados podem reduzir o spending. Créditos de cartão sem semântica suficiente são preservados no diagnóstico e **não são subtraídos automaticamente**.

### Income View

Separa receita confirmada de entradas classificadas como `income` apenas por fallback de direção. Isso evita apresentar uma transferência recebida desconhecida como salário/renda com confiança alta.

## Execução

```bash
npm run cycle6:4
```

Por padrão valores ficam ocultos. Para inspecionar localmente:

```env
FINANCE_ANALYSIS_SHOW_AMOUNTS=true
```

Nunca é necessário enviar essa saída com valores reais para o LLM ou para o repositório Git.

## Critérios de conclusão

- compra no cartão + pagamento de fatura não duplica spending;
- transferências próprias não viram receita/despesa consolidada;
- PENDING continua fora do histórico;
- estornos conhecidos reduzem spending;
- créditos de cartão ambíguos não são interpretados automaticamente;
- receita de baixa confiança aparece separada;
- engine funciona exclusivamente sobre o domínio, sem conhecer a API da Pluggy.

## Próximo ciclo

Ciclo 7: introduzir um `FinancialDataService` selecionável por repository e trocar as tools sintéticas por consultas ao engine real, preservando limites de exposição de dados ao LLM.
