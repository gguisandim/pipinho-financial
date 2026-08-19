import { env } from "../config/env.js";
import { createPluggyTransactionRepository } from "../integrations/pluggy/pluggy.factory.js";
import { DashboardDataService } from "../services/dashboard-data.service.js";
import { RealFinancialDataService } from "../services/real-financial-data.service.js";

console.log("=== DASHBOARD API DATA CONTRACT CHECK ===");
console.log("LLM: não utilizado");
console.log("Valores financeiros: ocultados\n");

const repository = createPluggyTransactionRepository();
const finance = new RealFinancialDataService(repository, {
  snapshotTtlMs: env.DASHBOARD_CACHE_TTL_MS,
});
const dashboard = new DashboardDataService(finance);
const overview = await dashboard.getOverview({ months: 12 });

if (overview.status !== "ok") {
  console.log("status: no_data");
  console.log(overview.message);
  process.exitCode = 1;
} else {
  console.log(`schemaVersion:       ${overview.schemaVersion}`);
  console.log(`source:              ${overview.source}`);
  console.log(`period:              ${overview.dataset.selectedPeriod.start} → ${overview.dataset.selectedPeriod.end}`);
  console.log(`transactions:        ${overview.dataset.transactionCount}`);
  console.log(`monthly points:      ${overview.monthly.status === "ok" ? overview.monthly.points.length : 0}`);
  console.log(`category points:     ${overview.categories.length}`);
  console.log(`institution points:  ${overview.institutions.length}`);
  console.log(`signals:             ${overview.signals.length}`);
  console.log(`income quality:      ${overview.quality.incomeQuality}`);
  console.log(`other tx share:      ${overview.quality.otherSpendingTransactionPct.toFixed(2)}%`);
  console.log(`other amount share:  ${overview.quality.otherSpendingAmountPct.toFixed(2)}%`);
  console.log(`financial charges:   ${overview.quality.financialChargesPct.toFixed(2)}% do valor gasto`);
  console.log(`savings available:   ${overview.quality.savingsAvailable ? "sim" : "não"}`);
  console.log(`raw tx in response:  ${overview.privacy.rawTransactionsIncluded ? "sim" : "não"}`);

  console.log("\n--- sinais determinísticos ---");
  for (const signal of overview.signals) {
    console.log(`[${signal.severity}] ${signal.code}: ${signal.title}`);
  }

  console.log("\nDashboard contract pronto para consumo HTTP.");
}
