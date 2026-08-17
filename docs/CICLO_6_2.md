# Ciclo 6.2 — Items, Accounts e Transactions reais

## Objetivo

Validar a leitura server-side dos dados reais já autorizados via MeuPluggy, sem envolver o LLM.

Fluxo:

```text
itemId persistido
   ↓
GET /items/{id}
   ↓
GET /accounts?itemId=...
   ↓
GET /v2/transactions?accountId=...
   ↓
paginação por cursor (`next`)
```

## Por que o projeto precisa de PLUGGY_ITEM_IDS?

A Pluggy não fornece busca/listagem de Items existentes por segurança. A aplicação deve persistir o `itemId` quando a conexão é criada/autorizada.

No uso pessoal com MeuPluggy, autorize cada banco na Demo Application. Para este laboratório, os três IDs podem ser armazenados no `.env`:

```env
PLUGGY_ITEM_IDS=<nubank-item-id>,<neon-item-id>,<picpay-item-id>
PLUGGY_ITEM_LABELS=Nubank,Neon,PicPay
```

Os labels são apenas locais; a API continua sendo a fonte de verdade.

## Segurança de saída

Por padrão o script:

- mascara Item IDs e Account IDs;
- mascara o número da conta/cartão;
- não imprime saldo/fatura;
- não imprime descrições das transações.

Para inspeção **somente no seu terminal local**:

```env
PLUGGY_DISCOVERY_SHOW_AMOUNTS=true
PLUGGY_DISCOVERY_SHOW_SAMPLES=true
```

Evite colar uma saída com esses flags ativos em chats, issues ou commits.

## Execução

```bash
npm run cycle6:2
```

O script valida cada Item, lista Accounts e copia todas as páginas de Transactions até `next = null` ou o limite local de segurança.

## Paginação

A integração usa `GET /v2/transactions`, e não o endpoint legado `/transactions`. O campo `next` da resposta é reutilizado como query string da próxima página.

O limite local evita loops/cursors anormais:

```env
PLUGGY_MAX_TRANSACTION_PAGES=25
```

## Critério de conclusão

O ciclo fecha quando Nubank, Neon e PicPay conseguem produzir:

- Item recuperado;
- Accounts recuperadas;
- Transactions recuperadas;
- paginação sem duplicação/loop;
- nenhuma informação enviada a um LLM.

O Ciclo 6.3 introduzirá `PluggyTransactionMapper` e `TransactionRepository` para converter os objetos externos ao domínio do projeto.

## Observações sobre os dados brutos

- `category` pode vir `null` no plano pessoal/gratuito; a categorização enriquecida é um recurso separado. O Ciclo 6.3 não dependerá desse campo para funcionar.
- Em cartão de crédito, o sinal de `amount` tem semântica própria: compras/débitos podem aparecer positivas e pagamentos/créditos negativas. O mapper do Ciclo 6.3 deve usar também `type` (`DEBIT`/`CREDIT`) e o tipo da Account, em vez de assumir que o sinal sozinho define entrada/saída.
- `PENDING` é preservado neste ciclo, mas no Financial Engine real decidiremos explicitamente se previsões/fatura aberta entram nos indicadores históricos.
