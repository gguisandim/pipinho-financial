# Ciclo 8.2 — Quality Gate + Dashboard API

Esta etapa acontece antes do próximo ciclo funcional. O objetivo é estabilizar o núcleo real e criar um contrato HTTP próprio para uma UI sem mover cálculo financeiro para o frontend ou para a LLM.

## O que os logs reais revelaram

1. O Agent está correto, mas ainda desperdiçava uma iteração quando descobria o período disponível e depois repetia exatamente essas datas em `get_cash_flow`. Agora, quando a pergunta é genérica e as datas são exatamente o período descoberto pelo backend, os filtros redundantes são removidos antes do guard temporal.
2. O provenance grounding funcionou, mas o log mostrou um repair remoto muito caro em latência/tokens. Nesta versão, violações simples de proveniência são corrigidas primeiro por um sanitizer determinístico; a LLM de repair só é usada se a correção local não resolver. O `qa:agent` registra rejeições, repairs e latência.
3. Muitos itens em `other` não são merchants desconhecidos: aparecem juros, IOF, multa e crédito rotativo. Isso indica lacuna de taxonomia. O audit real gera WARN específico para esse padrão; não fazemos migração automática de categoria nesta etapa.
4. As entradas BANK continuam corretamente conservadoras: transferências, recargas e estornos não viram renda confirmada sem evidência.

## Quality gates

### Local/determinístico

```bash
npm run qa:local
npm run qa:critical
npm run qa:dashboard
```

### Dados reais, sem LLM

```bash
npm run qa:real
```

O audit verifica, entre outros pontos:

- IDs únicos;
- amounts canônicos válidos;
- PENDING fora da análise histórica;
- paginação completa;
- identidade de liquidez;
- identidades de spending bruto/líquido;
- soma de categorias;
- anti-dupla-contagem;
- savings guard;
- cobertura de instituição;
- cobertura de categorias;
- sinais de encargos financeiros presos em `other`;
- qualidade de renda.

WARN não bloqueia avanço; FAIL bloqueia.

### Agent exploratório com dados reais

```bash
npm run qa:agent
```

Esse teste usa Groq e uma matriz de perguntas reais. Ele não é um teste determinístico de CI. Mede tool selection, grounding, chamadas rejeitadas, repairs e latência.

## Dashboard API

A API continua em TypeScript + Fastify. Não há benefício arquitetural em introduzir Python apenas para formar os mesmos agregados que já existem no Financial Engine.

Endpoints:

- `GET /api/v1/dashboard/overview`
- `GET /api/v1/dashboard/series/monthly`
- `GET /api/v1/dashboard/spending/categories`
- `GET /api/v1/dashboard/spending/institutions`
- `GET /api/v1/dashboard/expenses/largest`
- `GET /api/v1/dashboard/quality`
- `GET /api/v1/dashboard/capabilities`
- `POST /api/v1/dashboard/ai/insights`

O `overview` já entrega cards, séries, categorias, instituições, quality metadata e sinais determinísticos em um contrato estável `schemaVersion: 1.0`.


## Proteção HTTP

Os endpoints de dashboard expõem dados financeiros reais, portanto ficam protegidos por padrão:

```env
DASHBOARD_REQUIRE_AUTH=true
DASHBOARD_API_TOKEN=gere_um_token_longo_e_aleatorio
```

A chamada deve usar `Authorization: Bearer <token>`. Esse token é uma barreira server-to-server para o laboratório, não um sistema final de autenticação de usuário. Em uma UI web publicada, não coloque esse segredo no JavaScript do navegador; use um BFF/route handler server-side ou implemente autenticação de sessão antes de expor a aplicação.

## IA ativa no dashboard

A camada de IA não recebe o extrato completo nem descrições de transações. Ela recebe apenas agregados já calculados, quality metadata, top categorias/instituições e sinais determinísticos.

A LLM também não devolve valores financeiros. Ela devolve `metricRefs`, por exemplo:

```json
{
  "title": "Fluxo bancário negativo",
  "metricRefs": ["liquidity.netBankCashFlow"]
}
```

O backend resolve o valor real da métrica depois da resposta. Assim, o frontend pode exibir o card com o número calculado pelo engine, sem permitir que a LLM invente o valor.

Cada card também pode devolver uma `uiAction` de uma enum fechada, como `open_monthly`, `open_spending_categories`, `open_institutions`, `open_income_review` ou `open_quality`. Isso permite uma IA mais ativa: o card pode oferecer um botão que leva o usuário ao gráfico/área relevante, sem permitir que o modelo invente URLs ou execute ações financeiras.

O endpoint de IA é separado do overview para evitar uma chamada de modelo a cada refresh visual do dashboard.

## Cache

O serviço de dados usado pelo dashboard mantém um snapshot server-side com TTL configurável:

```env
DASHBOARD_CACHE_TTL_MS=300000
```

Isso evita consultar a Pluggy uma vez por card/gráfico e, ao mesmo tempo, evita que um servidor de longa duração mantenha os mesmos dados indefinidamente.

## Próximo passo

Depois de passar nos quality gates, o próximo ciclo pode criar a UI (por exemplo Next.js) consumindo exclusivamente esses contratos HTTP. Uma etapa paralela deve evoluir a taxonomia para separar encargos financeiros de `other` antes de usar categorias como base para recomendações mais fortes.
