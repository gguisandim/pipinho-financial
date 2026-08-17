# Ciclo 6.3 — Pluggy Mapper + TransactionRepository

## Objetivo

Separar a fonte Pluggy do domínio financeiro da aplicação. O restante do sistema passa a poder depender de `TransactionRepository` em vez de conhecer o formato da API externa.

## Fluxo

```text
Pluggy Item/Account/Transaction
          ↓
PluggyTransactionRepository
          ↓
PluggyTransactionMapper
          ↓
Domain Transaction
```

## Decisões de normalização

- `amount` do domínio é sempre positivo; a direção fica em `type`.
- O valor original da Pluggy permanece em `metadata.originalAmount` para auditoria.
- `POSTED` e `PENDING` são preservados em metadata; o repository exclui `PENDING` por padrão.
- Timestamps UTC são convertidos para data civil usando `FINANCE_TIME_ZONE`.
- BANK/CREDIT não são colapsados: `metadata.role` diferencia `bank_inflow`, `bank_outflow`, `card_purchase` e `card_credit`.
- Categorias Pluggy, quando disponíveis, têm prioridade. Sem categoria enriquecida, regras locais de descrição são usadas e o fallback é `other`.
- Transferências, investimentos e pagamentos de cartão conhecidos pela categoria do provider não são forçados para `income`.

## Por que preservar `role`?

Somar conta bancária e cartão de crédito de forma ingênua gera dupla contagem: a compra aparece no cartão e o pagamento da fatura aparece na conta bancária. O Ciclo 6.3 apenas preserva evidência suficiente para resolver isso; o Ciclo 6.4 definirá as visões de `cash flow` e `spending`.

## Validação real

```bash
npm run cycle6:3
```

O comando não imprime valores monetários. Ele mostra cobertura, quantidade mapeada, PENDING ignoradas, papéis BANK/CREDIT e qualidade da categorização.
