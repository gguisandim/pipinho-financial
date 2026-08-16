# Ciclo 3 — Local Tool Calling

## Objetivo

No Ciclo 1 e no Ciclo 2, o backend calculava um resumo completo antes mesmo de saber qual era a pergunta e enviava esse resumo inteiro ao LLM.

No Ciclo 3 isso muda:

```text
Pergunta
   ↓
LLM vê apenas os schemas das tools
   ↓
LLM escolhe a função e os argumentos
   ↓
Aplicação valida argumentos com Zod
   ↓
Financial Engine executa localmente
   ↓
Resultado determinístico volta ao LLM
   ↓
Resposta final
```

O modelo não recebe as 14 transações nem o `FinancialSummary` na primeira chamada.

## Por que "local" tool calling?

"Local" significa que o modelo escolhe a ferramenta, mas quem executa a função é a nossa aplicação. A Groq não executa o Financial Engine.

Isso nos permite controlar:

- quais operações existem;
- quais argumentos são aceitos;
- quais dados são lidos;
- quais cálculos são executados;
- o que é enviado ao LLM depois da execução.

## Tools disponíveis

### `get_financial_period`

Confirma a cobertura temporal do dataset.

### `get_cash_flow`

Retorna receitas, despesas, fluxo líquido e savings rate, com filtro opcional por período.

### `get_income`

Retorna receita agregada.

### `get_spending_by_category`

Retorna despesas agregadas por categoria ou uma categoria específica.

### `get_largest_expenses`

Retorna as maiores transações de despesa.

### `get_data_capabilities`

Explicita quais campos existem e quais ainda não existem no dataset. É útil para perguntas sobre Nubank/Itaú, investimentos e saldo de conta.

## Segurança do contrato

O LLM retorna `function.arguments` como uma string JSON. A aplicação NÃO executa esses argumentos diretamente.

Fluxo:

```text
function.arguments
      ↓
JSON.parse
      ↓
Zod.parse
      ↓
função financeira conhecida
```

Não há `eval`, SQL gerado pelo modelo nem nome de função arbitrário executado dinamicamente.

## Uma rodada, não um agente completo

O Ciclo 3 aceita uma rodada de tool calling:

```text
LLM -> tool(s) -> LLM -> resposta
```

Chamadas paralelas no primeiro turno são aceitas. Depois dos resultados, o segundo turno é enviado **sem definições de tools**, forçando uma resposta textual com base nos resultados já obtidos. Isso evita um comportamento documentado em que alguns modelos ainda tentam chamar ferramentas mesmo com `tool_choice = none`, causando HTTP 400.

Isso é deliberado. Um agente de verdade poderá decidir chamar outra ferramenta depois de observar o primeiro resultado. Esse loop será o Ciclo 4.

## Testes manuais

```bash
npm run cycle3 -- "Quanto gastei em julho?"
npm run cycle3 -- "Quanto tenho investido?"
npm run cycle3 -- "Eu gastei mais no Nubank ou no Itaú?"
npm run cycle3 -- "Qual foi minha maior categoria de gastos e por quê?"
npm run cycle3 -- "Analise meu fluxo financeiro"
```

Observe:

1. qual tool foi escolhida;
2. quais argumentos o LLM gerou;
3. o resultado bruto do backend;
4. a resposta final;
5. tokens e latência das duas chamadas de LLM.

## Critério de conclusão

O Ciclo 3 está concluído quando:

1. perguntas financeiras suportadas geram tool calls adequados;
2. argumentos passam por Zod;
3. os números da resposta vêm dos resultados das tools;
4. julho produz `no_data` em vez de um valor inventado;
5. banco/conta/investimentos são reconhecidos como capacidades ausentes;
6. a telemetria mostra separadamente planejamento e resposta final.

## Correção v0.3.2 — síntese final desacoplada

Alguns modelos podem tentar emitir outra chamada de ferramenta mesmo quando `tool_choice: "none"` está efetivamente ativo. Como a Groq bloqueia essa tentativa, a API responde `400 tool_use_failed`.

Para tornar o Ciclo 3 determinístico, a etapa final não reaproveita mais a conversa que contém `assistant.tool_calls` e mensagens `role=tool`. Após a única rodada de ferramentas, o serviço abre uma nova chamada de texto simples contendo apenas:

1. a pergunta original;
2. os nomes das ferramentas executadas;
3. os argumentos usados;
4. os resultados retornados pelo backend.

Assim, planejamento e síntese ficam separados:

```text
ToolCallingProvider -> escolhe tools
Backend             -> executa tools
LlmProvider          -> sintetiza resposta sem tools
```

O loop multi-turno, em que o modelo pode solicitar novas ferramentas depois de observar resultados anteriores, continua reservado para o Ciclo 4.
