import {
  env,
  getPluggyItemReferences,
  type PluggyItemReference,
} from "../config/env.js";
import { PluggyApiError } from "../integrations/pluggy/pluggy-api.client.js";
import { createPluggyDataClient } from "../integrations/pluggy/pluggy.factory.js";
import type {
  PluggyAccount,
  PluggyTransaction,
} from "../integrations/pluggy/pluggy-data.schemas.js";

function maskId(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function maskAccountNumber(value?: string | null): string {
  if (!value) return "n/d";
  const digits = value.replace(/\s+/g, "");
  if (digits.length <= 4) return `••${digits.slice(-2)}`;
  return `••••${digits.slice(-4)}`;
}

function formatMoney(value: number | null, currencyCode: string): string {
  if (value === null) return "n/d";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currencyCode || "BRL",
  }).format(value);
}

function dateOnly(value?: string | null): string {
  if (!value) return "n/d";
  return value.slice(0, 10);
}

function summarizeTransactions(transactions: PluggyTransaction[]) {
  const dates = transactions
    .map((tx) => tx.date)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  return {
    total: transactions.length,
    posted: transactions.filter((tx) => tx.status === "POSTED").length,
    pending: transactions.filter((tx) => tx.status === "PENDING").length,
    credits: transactions.filter((tx) => tx.type === "CREDIT").length,
    debits: transactions.filter((tx) => tx.type === "DEBIT").length,
    start: dates.at(0)?.slice(0, 10) ?? null,
    end: dates.at(-1)?.slice(0, 10) ?? null,
  };
}

function printSamples(transactions: PluggyTransaction[]): void {
  const samples = transactions.slice(0, 3);
  if (samples.length === 0) return;

  console.log("      amostras locais:");
  for (const tx of samples) {
    const amount = env.PLUGGY_DISCOVERY_SHOW_AMOUNTS === "true"
      ? formatMoney(Math.abs(tx.amount), tx.currencyCode)
      : "(valor ocultado)";
    console.log(
      `        - ${dateOnly(tx.date)} | ${tx.type} | ${amount} | ${tx.status} | ${tx.description.slice(0, 60)}`,
    );
  }
}

async function inspectAccount(
  dataClient: ReturnType<typeof createPluggyDataClient>,
  account: PluggyAccount,
): Promise<{ transactions: number; pages: number; truncated: boolean }> {
  const balance = env.PLUGGY_DISCOVERY_SHOW_AMOUNTS === "true"
    ? formatMoney(account.balance, account.currencyCode)
    : "(oculto; defina PLUGGY_DISCOVERY_SHOW_AMOUNTS=true para exibir localmente)";

  console.log(`    Account ${maskId(account.id)}`);
  console.log(`      nome: ${account.marketingName ?? account.name}`);
  console.log(`      tipo: ${account.type}/${account.subtype}`);
  console.log(`      número: ${maskAccountNumber(account.number)}`);
  console.log(`      saldo/fatura: ${balance}`);

  const collection = await dataClient.fetchAllTransactions(account.id, {
    dateFrom: env.PLUGGY_TRANSACTION_DATE_FROM,
    dateTo: env.PLUGGY_TRANSACTION_DATE_TO,
    maxPages: env.PLUGGY_MAX_TRANSACTION_PAGES,
  });
  const summary = summarizeTransactions(collection.transactions);

  console.log(
    `      transactions: ${summary.total} (${summary.posted} POSTED, ${summary.pending} PENDING)`,
  );
  console.log(`      CREDIT/DEBIT: ${summary.credits}/${summary.debits}`);
  console.log(`      período retornado: ${summary.start ?? "n/d"} → ${summary.end ?? "n/d"}`);
  console.log(`      páginas /v2/transactions: ${collection.pages}${collection.truncated ? " (TRUNCADO PELO LIMITE LOCAL)" : ""}`);

  if (env.PLUGGY_DISCOVERY_SHOW_SAMPLES === "true") {
    printSamples(collection.transactions);
  }

  return {
    transactions: summary.total,
    pages: collection.pages,
    truncated: collection.truncated,
  };
}

async function inspectItem(
  dataClient: ReturnType<typeof createPluggyDataClient>,
  ref: PluggyItemReference,
  index: number,
) {
  const item = await dataClient.fetchItem(ref.itemId);
  const connector = await dataClient.fetchConnectorForItem(item);
  const institution = ref.label ?? connector?.name ?? item.connector?.name ?? "Instituição não identificada";

  console.log(`\n[${index + 1}] ${institution}`);
  console.log(`  Item: ${maskId(item.id)}`);
  console.log(`  status: ${item.status ?? "n/d"} / execution=${item.executionStatus ?? "n/d"}`);
  console.log(`  última atualização: ${item.lastUpdatedAt ?? "n/d"}`);
  console.log(`  connector: ${connector?.name ?? item.connector?.name ?? "n/d"}`);

  const accounts = await dataClient.fetchAccounts(item.id);
  console.log(`  Accounts: ${accounts.length}`);

  let transactionCount = 0;
  let pageCount = 0;
  let truncatedAccounts = 0;

  for (const account of accounts) {
    const stats = await inspectAccount(dataClient, account);
    transactionCount += stats.transactions;
    pageCount += stats.pages;
    if (stats.truncated) truncatedAccounts += 1;
  }

  return {
    institution,
    accounts: accounts.length,
    transactions: transactionCount,
    pages: pageCount,
    truncatedAccounts,
  };
}

async function main() {
  console.log("=== CICLO 6.2: PLUGGY DATA DISCOVERY ===");
  console.log(`Base URL: ${env.PLUGGY_BASE_URL}`);

  const references = getPluggyItemReferences();
  if (references.length === 0) {
    console.error("\nNenhum Item configurado.");
    console.error("A Pluggy não fornece endpoint para listar Items existentes por segurança.");
    console.error("Adicione ao .env os itemId criados ao autorizar Nubank, Neon e PicPay:");
    console.error("\nPLUGGY_ITEM_IDS=<nubank-item-id>,<neon-item-id>,<picpay-item-id>");
    console.error("PLUGGY_ITEM_LABELS=Nubank,Neon,PicPay\n");
    process.exitCode = 1;
    return;
  }

  console.log(`Items configurados: ${references.length}`);
  console.log(
    `Janela: ${env.PLUGGY_TRANSACTION_DATE_FROM ?? "início disponível"} → ${env.PLUGGY_TRANSACTION_DATE_TO ?? "fim disponível"}`,
  );
  console.log(`Máx. páginas por Account: ${env.PLUGGY_MAX_TRANSACTION_PAGES}`);
  console.log("Valores financeiros: ocultados por padrão");

  const dataClient = createPluggyDataClient();
  const totals = {
    items: 0,
    accounts: 0,
    transactions: 0,
    pages: 0,
    truncatedAccounts: 0,
  };

  for (const [index, ref] of references.entries()) {
    try {
      const result = await inspectItem(dataClient, ref, index);
      totals.items += 1;
      totals.accounts += result.accounts;
      totals.transactions += result.transactions;
      totals.pages += result.pages;
      totals.truncatedAccounts += result.truncatedAccounts;
    } catch (error) {
      console.error(`\n[${index + 1}] Falha no Item ${ref.label ?? maskId(ref.itemId)}`);
      if (error instanceof PluggyApiError) {
        console.error(`  ${error.message}`);
        console.error(`  código: ${error.code ?? "n/d"} | HTTP: ${error.status ?? "n/d"}`);
      } else {
        console.error(`  ${error instanceof Error ? error.message : String(error)}`);
      }
      process.exitCode = 1;
    }
  }

  console.log("\n--- resumo ---");
  console.log(`Items lidos:        ${totals.items}/${references.length}`);
  console.log(`Accounts:           ${totals.accounts}`);
  console.log(`Transactions:       ${totals.transactions}`);
  console.log(`Páginas consultadas:${totals.pages}`);
  console.log(`Accounts truncadas: ${totals.truncatedAccounts}`);

  if (totals.items === references.length) {
    console.log("\nCiclo 6.2 concluído: leitura real de Items, Accounts e Transactions funcionando.");
    console.log("Próximo passo (6.3): Mapper + TransactionRepository para converter Pluggy → domínio financeiro.");
  }
}

main().catch((error) => {
  console.error("Falha inesperada no Ciclo 6.2:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
