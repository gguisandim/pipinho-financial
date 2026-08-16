# Ciclo 5A — Evaluation Harness

## Objetivo

Transformar avaliações manuais do agente em um benchmark repetível e mensurável.

O Ciclo 5A mede quatro dimensões por caso:

1. **Tool selection** — a ferramenta semanticamente necessária foi executada?
2. **Argument accuracy** — argumentos relevantes, como datas, foram gerados corretamente?
3. **Grounding** — a resposta final evitou generalizações e detalhes causais sem evidência?
4. **Answer requirements** — a resposta contém os elementos mínimos esperados para o caso?

Também coleta:

- iterações do agent loop;
- número de tool calls;
- latência média, P50 e P95;
- tokens médios e totais;
- taxa global de aprovação.

## Causal grounding

O Ciclo 4 mostrou uma falha real: o modelo inferiu que `housing` envolvia aluguel, condomínio e manutenção sem essas informações terem sido retornadas pela tool usada.

A correção agora tem três camadas:

```text
Prompt de grounding
       ↓
Tool evidenceScope + get_category_transactions
       ↓
CausalGroundingGuard determinístico
       ↓
se necessário: repair pass do LLM
       ↓
se ainda necessário: sanitização determinística
```

A política distingue:

- **explicação quantitativa**: permitida;
- **composição observada**: permitida somente com evidência de tool;
- **causa comportamental**: proibida sem evidência explícita.

## Executar

Todos os casos, uma vez:

```bash
npm run benchmark
```

Listar casos:

```bash
npm run benchmark -- --list
```

Executar apenas um caso:

```bash
npm run benchmark -- --case largest-category-causal
```

Executar três repetições:

```bash
npm run benchmark -- --runs 3
```

Por padrão o benchmark espera 25 segundos entre casos para reduzir a chance de atingir o TPM do free tier. Para alterar:

```bash
npm run benchmark -- --delay-ms 30000
```

Erros HTTP 429 também são repetidos automaticamente até duas vezes, respeitando `retry-after` quando disponível.

Relatórios são salvos em:

```text
reports/latest.md
reports/latest.json
reports/benchmark-<timestamp>.md
reports/benchmark-<timestamp>.json
```

## Casos iniciais

- fluxo geral;
- julho sem dados;
- investimentos ausentes;
- Nubank vs Itaú;
- maior categoria com pergunta causal;
- composição da categoria housing;
- maior gasto individual.

## Interpretação

O benchmark não é uma medida universal de qualidade do modelo. Ele mede o comportamento do agente **neste contrato de tools e neste dataset sintético**. Sua principal função é permitir comparação entre mudanças de prompt, arquitetura e provider usando o mesmo conjunto de casos.
