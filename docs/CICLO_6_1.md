# Ciclo 6.1 — Autenticação Pluggy

## Objetivo

Substituir o primeiro elo da fonte sintética por uma integração real, sem envolver o LLM ainda:

```text
PLUGGY_CLIENT_ID + PLUGGY_CLIENT_SECRET
                  ↓
             POST /auth
                  ↓
        API Key temporária (2h)
                  ↓
       cache em memória no backend
```

O Ciclo 6.1 termina aqui. Items, Accounts e Transactions entram no Ciclo 6.2.

## Segurança

- `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` ficam somente no backend.
- A API Key retornada por `/auth` também é segredo de backend.
- O script nunca imprime o valor das credenciais nem da API Key.
- `.env` deve continuar ignorado pelo Git.
- Em uma futura aplicação Next.js/Vercel, nenhuma dessas variáveis deve usar prefixo `NEXT_PUBLIC_`.

## Configuração

No Pluggy Dashboard, copie o Client ID e Client Secret da aplicação e coloque no `.env`:

```env
PLUGGY_CLIENT_ID=...
PLUGGY_CLIENT_SECRET=...
PLUGGY_BASE_URL=https://api.pluggy.ai
PLUGGY_AUTH_TIMEOUT_MS=15000
PLUGGY_API_KEY_TTL_SECONDS=7200
PLUGGY_API_KEY_REFRESH_SKEW_SECONDS=300
```

## Executar

```bash
npm run typecheck
npm test
npm run cycle6:1
```

ou:

```bash
npm run pluggy:check
```

Saída esperada:

```text
=== CICLO 6.1: PLUGGY AUTHENTICATION ===
Base URL: https://api.pluggy.ai
Credenciais configuradas: sim

✓ POST /auth concluído com sucesso.
API Key recebida: sim (valor ocultado)
Origem da chave: network
Expiração estimada: ...
Cache em memória: ✓ funcionando
Mesma sessão reutilizada: sim

Ciclo 6.1 concluído: autenticação server-side pronta.
```

## Decisões arquiteturais

### Sem SDK nesta etapa

A integração usa `fetch` diretamente para deixar visível o contrato HTTP da Pluggy. O foco do laboratório continua sendo compreender as camadas, não escondê-las atrás de um SDK.

### Cache em memória

A documentação da Pluggy informa que a API Key expira em 2 horas. Para evitar autenticar a cada request, `PluggyAuthClient` mantém a chave em memória e renova antes do limite configurado.

Esse cache não é persistente. Em serverless, instâncias diferentes podem gerar suas próprias API Keys. Para o escopo pessoal do projeto isso é aceitável; persistência/distribuição só será discutida se houver necessidade real.

### Sem dados financeiros ainda

O `/auth` apenas prova que nossa aplicação backend consegue obter autorização para usar a API. Não buscamos Item, conta, saldo ou transação neste ciclo.

## Critério de conclusão

- `npm run typecheck` passa.
- todos os testes passam.
- `npm run cycle6:1` autentica com credenciais reais.
- a API Key não aparece no terminal.
- a segunda chamada ao client usa cache em memória.
