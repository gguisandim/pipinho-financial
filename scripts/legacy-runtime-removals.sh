#!/usr/bin/env bash
set -euo pipefail

# Remoções SEGURAS já incorporadas na v0.9.8.
# Use apenas se estiver aplicando o cleanup manualmente sobre uma cópia da v0.9.7.
rm -f src/routes/ai.routes.ts src/routes/finance.routes.ts

printf '%s\n' "Rotas HTTP legadas removidas. O runtime deve registrar somente dashboardRoutes e assistantRoutes."
