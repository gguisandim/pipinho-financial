# Ciclo 10 — Pipinho Web e Dashboard Financeiro

## Objetivo

Transformar a Dashboard API consolidada no Ciclo 8/9 em uma interface web autenticada e utilizável, sem deslocar lógica financeira para o navegador.

## Arquitetura

Browser → Next.js/BFF → Fastify → Financial Engine → Pluggy

A autenticação web usa Supabase Auth. O token interno da API financeira permanece somente no servidor Next.js (`FINANCIAL_API_TOKEN`) e deve corresponder ao `DASHBOARD_API_TOKEN` do backend.

## Entregas

- Next.js 16 em `web/`, isolado das dependências da API.
- Supabase Auth com proteção das rotas privadas.
- Dashboard com métricas determinísticas, insights, categorias e série histórica.
- Página de gastos com categorias, instituições e maiores movimentações.
- Assistente e página de conexões.
- Filtro mensal compartilhado entre Dashboard e Gastos.
- Comparação das principais métricas com o mês anterior.
- Série histórica desacoplada do filtro do mês para manter contexto de até 12 meses.
- Filtro de período propagado pelo BFF para `startDate` / `endDate` do backend.
- Maiores despesas filtradas pelo mesmo período selecionado.
- Insights de IA calculados sobre o mesmo período do dashboard.
- Endurecimento mobile: navegação lateral, filtros, cards, gráfico rolável e tabela de gastos transformada em cards em telas pequenas.
- `turbopack.root` explícito para evitar inferência incorreta do workspace com múltiplos lockfiles.

## Regras preservadas

1. O frontend não recalcula métricas financeiras.
2. Pluggy continua sendo a fonte dos fatos financeiros.
3. O Financial Engine continua responsável pelos cálculos.
4. A LLM interpreta agregados e evidências; não recebe extrato cru.
5. Nenhum segredo da API financeira é exposto ao browser.

## Critério de fechamento

O Ciclo 10 pode ser considerado concluído quando:

- autenticação Supabase funciona localmente e no ambiente de deploy;
- Dashboard e Gastos filtram corretamente por mês;
- métricas exibidas correspondem ao período selecionado;
- insights usam o mesmo intervalo temporal;
- maiores despesas respeitam o filtro;
- build e typecheck do frontend passam;
- navegação principal permanece utilizável em desktop e mobile;
- backend continua independente do bundle do frontend.

## Próximo ciclo

Ciclo 11 — Natural Financial Agent: ampliar ferramentas, contexto conversacional, follow-ups e robustez para linguagem informal/trivial sem transformar o Pipinho em um chatbot baseado em comandos.
