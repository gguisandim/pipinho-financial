# v0.9.1 — Robustez do Agent real e Enrichment

## Falha transitória da Pluggy no Ciclo 7

A v0.9.0 mantinha uma Promise rejeitada no cache do `RealFinancialDataService`. Se a primeira leitura Pluggy falhasse por timeout/rede, todas as tools posteriores daquela execução reutilizavam a mesma rejeição. Além disso, a assinatura da tool era marcada como vista antes da execução, impedindo repetir a mesma chamada após um erro transitório.

A v0.9.1:

- limpa `snapshotPromise` quando a leitura falha;
- permite repetir tool após `execution_error`;
- adiciona retry exponencial para falhas de rede e HTTP 429/5xx da Pluggy;
- mantém 401 com renovação da API key;
- mostra `code` e mensagem de tools rejeitadas no `cycle7`.

## Structured Outputs do Ciclo 8

A classificação de 12 candidatos em um único JSON podia consumir o limite de completion antes de fechar um documento válido.

A v0.9.1:

- classifica candidatos em lotes de 4 por padrão;
- usa até 2400 completion tokens por lote;
- reduz o tamanho máximo de `reason`;
- agrega sugestões/telemetria dos lotes.

Configurações opcionais:

```env
PLUGGY_REQUEST_RETRIES=2
PLUGGY_RETRY_BASE_MS=500
ENRICHMENT_BATCH_SIZE=4
ENRICHMENT_MAX_COMPLETION_TOKENS=2400
```
