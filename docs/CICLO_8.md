# Ciclo 8 — Data Enrichment + LLM Classification

## Objetivo

Melhorar a qualidade de categorias sem enviar o extrato completo ao LLM e sem permitir que uma classificação remota altere automaticamente o domínio financeiro.

O dataset real ainda possui duas limitações observadas:

- percentual relevante de spending em `other`;
- renda insuficientemente identificada.

O Ciclo 8 trata essas duas dimensões de forma diferente:

1. despesas `other`: o backend agrupa descrições repetidas, sanitiza identificadores e pode pedir ao LLM uma **sugestão** de categoria;
2. entradas BANK: ficam em **human-in-the-loop**. Elas não são enviadas ao LLM e não viram renda confirmada sem validação humana.

## Fluxo

```text
PluggyTransactionRepository
        ↓
transações canônicas
        ↓
Enrichment Candidate Builder
        ├── despesas other
        └── entradas BANK não classificadas
               ↓
Description Sanitizer
               ↓
    ┌──────────┴──────────┐
    │                     │
despesa elegível      entrada BANK
    │                     │
Groq Structured           │
Outputs                    │
    │                     │
sugestão              revisão humana
    │                     │
    └──────────┬──────────┘
               ↓
       relatório/template

Nenhuma sugestão é aplicada automaticamente.
```

## Minimização de dados

O prompt de classificação de despesas não recebe:

- valores monetários;
- `accountId`;
- `itemId`;
- datas;
- extrato completo;
- entradas BANK.

Descrições com contexto PIX/transferência, email, documento ou telefone são consideradas não elegíveis para classificação remota por padrão. O sanitizer é uma camada heurística de minimização, não uma garantia formal de anonimização; por isso o ciclo classifica apenas um conjunto limitado de despesas repetidas e nunca envia entradas BANK ao LLM.

## Comandos

Scan sem LLM:

```bash
npm run enrichment:scan
```

Scan + classificação de despesas:

```bash
npm run cycle8
```

Mostrar descrições sanitizadas localmente para revisão:

```bash
npm run cycle8 -- --show-descriptions
```

Configurações principais:

```env
ENRICHMENT_USE_LLM=true
ENRICHMENT_SHOW_DESCRIPTIONS=false
ENRICHMENT_MIN_OCCURRENCES=2
ENRICHMENT_MAX_EXPENSE_GROUPS=12
ENRICHMENT_MAX_INFLOW_GROUPS=12
```

## Saídas

```text
reports/enrichment/latest.json
reports/enrichment/overrides-template.json
```

`overrides-template.json` é propositalmente gerado com `approved: false`.

O próximo passo deve aplicar apenas regras explicitamente aprovadas e substituir persistência local por armazenamento adequado quando o projeto migrar para aplicação web.
