# Ciclo 11 — Natural Financial Agent

Status: **FECHADO em 20/08/2026. C11.1–C11.4 aprovados.**

## Objetivo

Fazer o Pipinho deixar de depender de perguntas quase "comando" e passar a sustentar conversa financeira natural, sem abrir mão dos guardrails construídos nos ciclos anteriores.

O princípio continua sendo:

**Pluggy fornece fatos → Financial Engine calcula → tools expõem evidência limitada → LLM interpreta → grounding valida.**

O histórico de conversa ajuda a entender intenção, mas **não vira fonte de verdade financeira**.

## C11.1 — Contexto curto + perguntas triviais

Implementado:

- `history` de até 10 mensagens no `/api/v1/assistant`;
- `conversationId` preparado no contrato HTTP;
- follow-ups contextuais como:
  - `E mês passado?`
  - `E no Nubank?`
  - `E ontem?`
- roteamento contextual usa a pergunta anterior quando a mensagem atual parece um follow-up;
- a mensagem atual prevalece para período quando ela própria contém referência temporal;
- datas relativas normalizadas deterministicamente:
  - hoje;
  - ontem;
  - anteontem;
  - este mês;
  - mês passado;
  - esta semana;
  - semana passada;
  - últimos N dias;
- conversa simples (`oi`, `valeu`, `o que você faz?`) não força chamada de tool;
- frontend envia o contexto recente e oferece `Nova conversa`;
- o chat aceita mensagens curtas, incluindo `oi`.

## Novas tools

### `get_recent_transactions`

Para último gasto, última compra e movimentações recentes. O backend pode restringir a `spending` ou renda identificada.

Importante: a ordenação usa a data disponível. Sem timestamp intradiário, o agente não pode inventar qual de duas transações do mesmo dia ocorreu primeiro.

### `search_transactions`

Busca limitada por:

- descrição;
- instituição;
- nome da conta.

Exemplos de uso:

- `Quanto foi aquele Uber de ontem?`
- `Procura os gastos do iFood.`

O extrato completo continua sem ser enviado ao LLM.

### `get_daily_spending_summary`

Calcula no backend:

- gasto total;
- quantidade de dias civis;
- dias com spending;
- média por dia civil;
- média por dia em que houve gasto;
- dia de maior gasto;
- até 31 pontos diários recentes (a série detalhada é limitada para reduzir exposição e tokens).

Exemplo:

- `Quanto eu costumo gastar por dia?`

## Segurança do contexto

O histórico não libera números antigos para a resposta atual. Qualquer valor em R$ ou percentual continua precisando estar presente em uma tool executada **na resposta atual** para passar pelo evidence grounding.

Isso permite:

1. compreender `E mês passado?` usando a intenção da pergunta anterior;
2. consultar novamente o Financial Engine para o novo período;
3. responder com fatos atuais e verificáveis.

## Frontend

O chat agora envia:

```json
{
  "question": "E mês passado?",
  "conversationId": "...",
  "history": [
    { "role": "user", "content": "Quanto eu gastei este mês?" },
    { "role": "assistant", "content": "..." }
  ]
}
```

Nesta etapa, a memória é **curta e enviada pelo frontend**. Não há persistência de conversa no Supabase ainda.

## QA

Local, sem providers reais:

```bash
npm run qa:conversation
```

Audit real com Pluggy + Groq configurados:

```bash
npm run qa:conversation:real
```

O audit real cobre uma conversa com follow-ups e perguntas triviais/recentes.

## C11.2 — Resolução semântica mais ampla

Implementado:

- saldo atual via `get_account_balances`, usando Accounts da Pluggy;
- o total de saldo bancário agregado soma somente contas `BANK`;
- contas `CREDIT` são listadas separadamente e nunca entram no total bancário agregado;
- snapshots de conta não expõem `accountId` nem `itemId` ao LLM;
- aliases de instituições:
  - `roxinho` / `nu bank` → Nubank;
  - `pic pay` → PicPay;
  - `banco neon` → Neon;
- roteamento distingue `quanto tenho no Nubank?` de `quanto gastei no Nubank?`;
- busca textual tolerante a pequenos erros de digitação e aliases;
- quando uma busca não encontra o merchant pedido, o backend pode retornar até 5 movimentações do mesmo período como **alternativas**, marcadas explicitamente como não-correspondências;
- `Quanto eu costumo gastar por dia?` usa por padrão uma janela recente de 90 dias quando não há período explícito;
- comparações como `Gastei muito ontem?` usam a mesma baseline recente para evitar comparar um dia com todo o histórico;
- follow-ups reconhecem também referências como `no roxinho`, `nessa conta` e `lá`.

### Tool `get_account_balances`

Retorna:

- saldo bancário agregado quando as moedas são compatíveis;
- contas BANK e CREDIT separadas;
- saldo individual por conta;
- instituição, nome, tipo/subtipo e moeda;
- timestamp de atualização do Item quando disponível.

Regra de segurança: **saldo de cartão não é saldo bancário**.

### Busca aproximada

`search_transactions` agora classifica correspondências como `exact` ou `fuzzy`. O agente deve informar quando a correspondência for aproximada.

Se não houver correspondência, `alternatives` serve apenas para ajudar o usuário a reconhecer uma movimentação do mesmo período. O agente não pode dizer que uma alternativa é o merchant pesquisado.

## C11.3 — Memória persistente de conversa

Implementado:

- `pipinho_chat_sessions` e `pipinho_chat_messages` no Supabase;
- RLS por `auth.uid()`;
- retomada de conversas entre dispositivos;
- o browser envia apenas `question` + `conversationId`;
- o Next/BFF recupera no servidor até 10 mensagens recentes e só então chama o Fastify;
- histórico enviado pelo navegador deixa de ser a fonte de confiança da memória;
- `routing_memory` guarda somente até 5 perguntas recentes do usuário como resumo seguro de roteamento;
- esse resumo nunca é tratado como evidência financeira;
- retenção configurável por `PIPINHO_CHAT_RETENTION_DAYS` (365 dias por padrão, `0` desativa expiração);
- limpeza oportunística de sessões expiradas;
- exclusão de conversa individual;
- exclusão de toda a memória do usuário;
- o extrato bruto da Pluggy e resultados completos de tools continuam fora do Supabase.

Migration:

```text
supabase/migrations/20260820031000_c11_3_chat_memory.sql
```

## C11.4 — Evaluation harness conversacional

Implementado um corpus determinístico de **51 casos** cobrindo:

- saudações e perguntas triviais sem uso desnecessário de tools;
- gastos em linguagem informal (`quanto eu torrei esse mês?`);
- saldo e aliases (`roxinho`, `nu`, `nubnak`, `pic pay`);
- renda e poupança;
- categorias e gastos por instituição;
- transações recentes;
- busca textual e erro de digitação (`Uberr`);
- média diária com janela padrão de 90 dias;
- maiores gastos;
- perguntas não suportadas (`investimentos`, `limite`, `fatura`, `score de crédito`);
- follow-ups com histórico curto;
- follow-ups usando `routing_memory` persistente.

O corpus local valida de forma determinística:

- intent selecionada;
- tools permitidas/obrigatórias;
- tools proibidas;
- herança de contexto;
- aliases de instituição;
- normalização de períodos relativos;
- argumentos determinísticos das tools.

Comando local:

```bash
npm run qa:conversation:benchmark
```

O audit real executa **19 casos representativos** contra Groq + Pluggy e gera:

```text
reports/conversation/latest.json
reports/conversation/latest.md
```

Comando:

```bash
npm run qa:conversation:benchmark:real
```

Gate real para fechar o Ciclo 11:

- pass rate >= 90%;
- grounding = 100%;
- tool accuracy >= 95%;
- argument accuracy >= 95%;
- context accuracy = 100%;
- limitation accuracy = 100%.

Também foram reforçados alguns pontos descobertos pelo corpus:

- `esse mês` e `essa semana` passam a ser períodos relativos explícitos;
- `salve pipinho` e `o que vc faz?` são conversa simples;
- `roxinho`, `nu`, `nubnak` e `pic pay` são tratados como aliases;
- `quanto eu tenho investido?` não é confundido com saldo bancário;
- `score de crédito`, fatura e limite do cartão são encaminhados para capabilities;
- `compra mais cara` tem precedência sobre a categoria genérica de compras;
- `Uberr` é reconhecido como busca aproximada de transação.

Atalhos de QA:

```bash
npm run qa:cycle11
npm run qa:cycle11:full
```

`qa:cycle11` roda somente gates locais. `qa:cycle11:full` adiciona os audits reais e exige credenciais de provider/Pluggy.

## Critério para fechar o Ciclo 11

A implementação está completa até C11.4. O fechamento ocorre quando o gate real da C11.4 passar de forma repetível e o agente demonstrar que:

- follow-ups mantêm intenção e período corretamente;
- perguntas triviais/recentes são respondidas quando os dados permitem;
- limitações são declaradas em vez de inventadas;
- grounding continua passando;
- conversa deixa de depender de formulações rígidas;
- contexto pode ser mantido de forma segura e controlada.


## Fechamento real

Gate executado em 20/08/2026:

- 131/131 testes locais;
- frontend typecheck/build aprovado;
- benchmark real: 19/19 casos;
- pass rate 100%;
- grounding 100%;
- tool accuracy 100%;
- argument accuracy 100%;
- context accuracy 100%;
- limitation accuracy 100%.

Dívida técnica carregada: latência média do benchmark real ~12,4 s, com buscas livres mais lentas.
