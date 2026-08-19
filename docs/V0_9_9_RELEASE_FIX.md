# v0.9.9 — Workspace + Release Fix

Correções focadas na preparação da API antes do frontend.

- remove arquivos históricos que não são usados pelo runtime, pelos testes atuais ou pelos QAs ativos;
- adiciona `clean:stale` para eliminar arquivos antigos deixados por atualização de ZIP por sobreposição;
- `typecheck` e `build` executam o cleanup automaticamente;
- `build` limpa `dist/` antes de compilar para impedir JavaScript legado residual;
- tipa explicitamente o retorno de `DashboardInsightService`, removendo `any` do cache e dos cards;
- `package:api` resolve a raiz pelo próprio script, verifica o release, imprime caminho absoluto e tenta gerar ZIP no Windows;
- `verify:release` falha se testes, TypeScript fonte, scripts, fixtures ou módulos legados vazarem para o artefato.

O repositório de desenvolvimento continua contendo a suíte de testes e os módulos necessários aos quality gates. O release final continua whitelist-only: `dist/`, manifests, `.env.example` e README.
