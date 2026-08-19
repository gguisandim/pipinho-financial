#!/usr/bin/env bash
set -euo pipefail

# ATENÇÃO: execute somente em uma CÓPIA destinada a release.
# O repositório de desenvolvimento deve manter testes, QA e histórico.
# O caminho preferido continua sendo `npm run package:api`, que usa whitelist.

ROOT="${1:-.}"
cd "$ROOT"

rm -rf \
  tests \
  docs \
  reports \
  coverage \
  node_modules \
  release \
  src/scripts \
  src/evaluation \
  src/enrichment \
  src/quality \
  src/fixtures \
  src/llm/openai-compatible

rm -f \
  src/routes/ai.routes.ts \
  src/routes/finance.routes.ts \
  src/services/financial-insight.service.ts \
  src/services/structured-financial-insight.service.ts \
  src/services/tool-calling-financial.service.ts \
  src/services/transaction-enrichment.service.ts \
  src/services/real-financial-agent.factory.ts \
  src/repositories/synthetic-transaction.repository.ts \
  src/financial-tools/financial-tools.ts \
  src/llm/providers/openrouter.provider.ts \
  src/llm/tool-calling/openrouter-tool-calling.provider.ts \
  src/llm/prompts/financial-agent.prompt.ts \
  src/llm/prompts/financial-summary.prompt.ts \
  src/llm/prompts/financial-structured.prompt.ts \
  src/llm/prompts/financial-tool-synthesis.prompt.ts \
  src/llm/prompts/financial-tools.prompt.ts \
  src/llm/prompts/transaction-enrichment.prompt.ts \
  src/llm/schemas/financial-analysis.schema.ts \
  src/llm/schemas/transaction-enrichment.schema.ts

printf '%s\n' "Prune concluído. Para produção, prefira: npm run package:api"
