# Ciclo 2 — Structured Outputs + Zod

## Objetivo

Transformar a saída do LLM de texto livre em um contrato de software validável.

No Ciclo 1:

```text
LLM -> string
```

No Ciclo 2:

```text
Zod schema
   ↓
JSON Schema
   ↓
Groq Structured Outputs
   ↓
JSON estrito
   ↓
JSON.parse
   ↓
Zod.parse
   ↓
objeto TypeScript
```

## Por que um segundo modelo?

`llama-3.1-8b-instant` continua sendo usado no Ciclo 1. Para o Ciclo 2, o padrão é `openai/gpt-oss-20b`, pois ele suporta Structured Outputs em modo estrito na Groq.

## Contrato

A resposta contém:

- `status`: `answered` ou `insufficient_data`;
- `answer`: resposta natural para apresentação ao usuário;
- `facts`: fatos estruturados sustentados pelo resumo;
- `missingData`: dados ausentes necessários para responder;
- `confidence`: autodeclaração do modelo sobre sustentação da resposta no contexto.

`confidence` não é uma probabilidade estatisticamente calibrada e não deve ser usada como indicador financeiro.

## O que Structured Outputs resolve

Ele resolve problemas de integração:

- JSON inválido;
- propriedade ausente;
- tipo errado;
- enum inesperado;
- estrutura variável entre respostas.

Ele NÃO prova que um número está correto. Um objeto pode cumprir o schema e ainda conter uma afirmação factualmente errada. A validação factual será tratada separadamente nos próximos experimentos.

## Testes

```bash
npm test
npm run typecheck
```

Teste a API/modelo:

```bash
npm run cycle2 -- "Quanto gastei em julho?"
npm run cycle2 -- "Quanto tenho investido?"
npm run cycle2 -- "Eu gastei mais no Nubank ou no Itaú?"
npm run cycle2 -- "Qual foi minha maior categoria de gastos e por quê?"
```

## Resultados esperados conceitualmente

### Julho

```json
{
  "status": "insufficient_data",
  "missingData": ["transações de julho de 2026"]
}
```

### Investimentos

```json
{
  "status": "insufficient_data",
  "missingData": ["investimentos"]
}
```

### Nubank x Itaú

O ideal é apontar ausência de `instituição financeira` ou `conta associada às transações`, e não ausência de categoria.

### Maior categoria

Deve identificar `housing = 1400`, mas não deve inventar a causa do gasto. O resumo permite responder qual categoria é a maior, mas não explicar causalmente por que o usuário gastou esse valor.

## Critério de conclusão

O Ciclo 2 está concluído quando:

1. `npm test` passa;
2. `npm run typecheck` passa;
3. `npm run cycle2` retorna um objeto validado;
4. perguntas sem dados retornam `status = insufficient_data`;
5. `missingData` diferencia corretamente categoria, instituição, período e investimento quando aplicável.
