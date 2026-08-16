# Ciclo 4 — Agent Loop controlado

## Objetivo

Transformar o tool calling de uma única rodada em um loop multi-turno no qual o modelo pode:

1. escolher uma ferramenta;
2. receber o resultado do backend;
3. perceber que ainda falta informação ou que a chamada foi inválida;
4. corrigir a estratégia;
5. chamar outra ferramenta;
6. encerrar com uma resposta textual quando houver evidência suficiente.

## O problema que motivou este ciclo

No Ciclo 3, a pergunta `Analise meu fluxo financeiro` fez o modelo inventar `2023-01-01` a `2023-12-31`. O backend respondeu corretamente `no_data`, mas como o Ciclo 3 tinha apenas uma rodada, a execução terminou com uma conclusão errada sobre ausência de dados.

O Ciclo 4 trata esse caso em duas camadas:

- **prompt/tool descriptions**: datas não devem ser inventadas;
- **guard determinístico**: se a pergunta não contém restrição temporal, argumentos `startDate/endDate` são rejeitados com `tool_error: ungrounded_date`.

Esse erro volta ao modelo como resultado de tool. O agente pode então corrigir a chamada, por exemplo usando `get_financial_period` e depois `get_cash_flow({})`.

## Fluxo

```text
user
  ↓
LLM + tools
  ↓
tool_call
  ↓
argument guard + Zod
  ↓
backend
  ↓
role=tool
  ↓
LLM + tools
  ↓
... repete ...
  ↓
resposta final
```

## Guardrails

- máximo padrão de 5 iterações;
- máximo padrão de 12 chamadas de ferramentas;
- datas sem grounding são rejeitadas;
- argumentos inválidos viram feedback estruturado em vez de derrubar o processo;
- chamadas idênticas repetidas são bloqueadas;
- ao atingir o limite, uma síntese limpa sem tools produz a melhor resposta possível com os resultados já obtidos.

## Comando

```bash
npm run cycle4 -- "Analise meu fluxo financeiro"
```

Teste de recuperação temporal:

```bash
npm run cycle4 -- "Quanto gastei em julho?"
```

Teste de capability:

```bash
npm run cycle4 -- "Quanto tenho investido?"
```

## Critério de conclusão

O ciclo está concluído quando:

- o modelo consegue fazer mais de uma rodada de ferramentas;
- um `tool_error` não encerra a execução;
- o agente corrige pelo menos um erro de argumentos em teste automatizado;
- loops são limitados por `maxIterations` e `maxToolCalls`;
- a resposta final continua baseada apenas nos resultados das ferramentas.

## Patch 0.4.1 — argumentos opcionais e validação do provider

O GPT-OSS pode representar um argumento opcional ausente como `null`, por exemplo
`{"startDate": null, "endDate": null}`. O schema enviado ao provider agora aceita
`null` para parâmetros opcionais, e a camada local normaliza esses valores para
campos omitidos antes da validação Zod.

Além disso, quando a Groq responde `tool_use_failed` antes de devolver a tool call
normalmente, o provider tenta recuperar `failed_generation` e encaminhá-la ao loop
local. Assim, Zod e os guards semânticos continuam sendo a autoridade final sobre
a execução da ferramenta, em vez de um erro de validação do provider encerrar o
agente imediatamente.

## Atualização de causal grounding (v0.5.0)

Após o benchmark manual do Ciclo 4, foi observado um claim não fundamentado: o modelo explicou `housing` usando generalizações sobre aluguel, condomínio e manutenção sem essas informações terem sido retornadas pela tool usada.

A partir da v0.5.0, o agente distingue explicação quantitativa, composição observada e causa comportamental. A composição pode ser consultada por `get_category_transactions`; causas comportamentais continuam indisponíveis no dataset sintético. A resposta final também passa por um guard determinístico e, quando necessário, por um repair pass controlado.
