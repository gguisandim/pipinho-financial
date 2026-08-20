# Ciclo 11 — Natural Financial Agent

Status: **iniciado — C11.1 implementado**.

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

## Próximos passos do Ciclo 11

### C11.2 — Resolução semântica mais ampla

- aliases de merchants/instituições;
- perguntas incompletas além dos padrões determinísticos;
- busca textual mais robusta;
- comparação de "normal" vs período específico;
- reduzir respostas desnecessariamente formais.

### C11.3 — Memória de conversa

- persistir sessões e mensagens no Supabase;
- recuperar contexto entre dispositivos;
- resumo de conversa para evitar histórico infinito;
- política de retenção e exclusão.

### C11.4 — Evaluation harness conversacional

Criar corpus maior com:

- gírias;
- erros de digitação;
- follow-ups;
- perguntas triviais;
- referências como "aquele gasto";
- instituições abreviadas;
- perguntas impossíveis que devem declarar limitação.

## Critério para fechar o Ciclo 11

O Ciclo 11 não está fechado em C11.1. Para encerrá-lo, o agente deve demonstrar em avaliação repetível que:

- follow-ups mantêm intenção e período corretamente;
- perguntas triviais/recentes são respondidas quando os dados permitem;
- limitações são declaradas em vez de inventadas;
- grounding continua passando;
- conversa deixa de depender de formulações rígidas;
- contexto pode ser mantido de forma segura e controlada.
