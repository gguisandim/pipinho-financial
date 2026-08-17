import { env } from "../config/env.js";
import type {
  CategorySource,
  Transaction,
  TransactionCategory,
  TransactionRole,
} from "../domain/finance.js";
import { createPluggyTransactionRepository } from "../integrations/pluggy/pluggy.factory.js";

function countBy<T extends string>(values: T[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function sortCounts(record: Record<string, number>): [string, number][] {
  return Object.entries(record).sort((a, b) => b[1] - a[1]);
}

function printCounts(title: string, entries: [string, number][]): void {
  console.log(`\n${title}`);
  for (const [label, count] of entries) {
    console.log(`  ${label}: ${count}`);
  }
}

function describeCoverage(transactions: Transaction[]) {
  if (transactions.length === 0) return { start: null, end: null };
  const dates = transactions.map((tx) => tx.date).sort((a, b) => a.localeCompare(b));
  return { start: dates[0] ?? null, end: dates.at(-1) ?? null };
}

async function main() {
  console.log("=== CICLO 6.3: PLUGGY → DOMAIN MAPPER + REPOSITORY ===");
  console.log(`Time zone: ${env.FINANCE_TIME_ZONE}`);
  console.log("PENDING: excluídas por padrão das análises históricas");
  console.log("Valores financeiros: não exibidos neste ciclo");

  const repository = createPluggyTransactionRepository();
  const snapshot = await repository.listTransactions({
    dateFrom: env.PLUGGY_TRANSACTION_DATE_FROM,
    dateTo: env.PLUGGY_TRANSACTION_DATE_TO,
    includePending: false,
  });

  const coverage = describeCoverage(snapshot.transactions);
  const diagnostics = snapshot.diagnostics;

  console.log("\n--- repository ---");
  console.log(`source:              ${snapshot.source}`);
  console.log(`items:               ${diagnostics.items ?? 0}`);
  console.log(`accounts:            ${diagnostics.accounts ?? 0}`);
  console.log(`raw transactions:    ${diagnostics.rawTransactions}`);
  console.log(`mapped transactions: ${diagnostics.mappedTransactions}`);
  console.log(`pending ignoradas:   ${diagnostics.skippedPending}`);
  console.log(`inválidas ignoradas: ${diagnostics.skippedInvalid}`);
  console.log(`accounts truncadas:  ${diagnostics.truncatedAccounts ?? 0}`);
  console.log(`período canônico:    ${coverage.start ?? "n/d"} → ${coverage.end ?? "n/d"}`);

  const institutions = countBy(
    snapshot.transactions.map((tx) => tx.metadata?.institution ?? "n/d"),
  );
  printCounts("--- instituições ---", sortCounts(institutions));

  const roles = countBy(
    snapshot.transactions.map(
      (tx) => (tx.metadata?.role ?? "n/d") as TransactionRole | "n/d",
    ),
  );
  printCounts("--- papéis financeiros preservados ---", sortCounts(roles));

  const categories = countBy(
    snapshot.transactions.map((tx) => tx.category as TransactionCategory),
  );
  printCounts("--- categorias canônicas ---", sortCounts(categories));

  const categorySources = countBy(
    snapshot.transactions.map(
      (tx) => (tx.metadata?.categorySource ?? "n/d") as CategorySource | "n/d",
    ),
  );
  printCounts("--- origem da categorização ---", sortCounts(categorySources));

  const otherCount = categories.other ?? 0;
  const otherPct = snapshot.transactions.length > 0
    ? (otherCount / snapshot.transactions.length) * 100
    : 0;

  console.log("\n--- qualidade do mapeamento ---");
  console.log(`IDs únicos:           ${new Set(snapshot.transactions.map((tx) => tx.id)).size === snapshot.transactions.length ? "sim" : "NÃO"}`);
  console.log(`amount sempre >= 0:   ${snapshot.transactions.every((tx) => tx.amount >= 0) ? "sim" : "NÃO"}`);
  console.log(`metadata source:      ${snapshot.transactions.every((tx) => tx.metadata?.source === "pluggy") ? "pluggy em 100%" : "inconsistente"}`);
  console.log(`categoria other:      ${otherCount}/${snapshot.transactions.length} (${otherPct.toFixed(1)}%)`);

  if (otherPct > 50) {
    console.log("  aviso: muitas transações ficaram em `other`. Isso é esperado se a categorização premium da Pluggy estiver indisponível; o Ciclo 6.4 pode evoluir regras locais.");
  }

  console.log("\nCiclo 6.3 concluído: dados Pluggy foram convertidos para o domínio sem alterar o Agent/LLM.");
  console.log("Próximo passo (6.4): adaptar o Financial Engine para papéis BANK/CREDIT e evitar dupla contagem de cartão/transferências.");
}

main().catch((error) => {
  console.error("Falha no Ciclo 6.3:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
