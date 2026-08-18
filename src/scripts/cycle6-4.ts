import { env } from "../config/env.js";
import { analyzeFinancialViews } from "../financial-engine/real-views.js";
import { createPluggyTransactionRepository } from "../integrations/pluggy/pluggy.factory.js";

function money(value: number | null, show: boolean): string {
  if (value === null) return "n/d";
  if (!show) return "(oculto)";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function percent(value: number | null): string {
  if (value === null) return "n/d";
  return `${value.toFixed(2)}%`;
}

async function main() {
  const showAmounts = env.FINANCE_ANALYSIS_SHOW_AMOUNTS === "true";

  console.log("=== CICLO 6.4: FINANCIAL ENGINE — CASH FLOW x SPENDING ===");
  console.log(`Time zone: ${env.FINANCE_TIME_ZONE}`);
  console.log("PENDING: excluídas pelo repository");
  console.log(`Valores financeiros: ${showAmounts ? "visíveis localmente" : "ocultados por padrão"}`);

  const repository = createPluggyTransactionRepository();
  const snapshot = await repository.listTransactions({
    dateFrom: env.PLUGGY_TRANSACTION_DATE_FROM,
    dateTo: env.PLUGGY_TRANSACTION_DATE_TO,
    includePending: false,
  });

  const analysis = analyzeFinancialViews(snapshot.transactions);

  console.log(`\nPeríodo: ${analysis.period.start} → ${analysis.period.end}`);
  console.log(`Transações canônicas: ${analysis.diagnostics.totalTransactions}`);

  console.log("\n--- LIQUIDEZ BANCÁRIA ---");
  console.log(`Entradas BANK:         ${money(analysis.liquidity.bankInflows, showAmounts)}`);
  console.log(`Saídas BANK:           ${money(analysis.liquidity.bankOutflows, showAmounts)}`);
  console.log(`Fluxo líquido BANK:    ${money(analysis.liquidity.netBankCashFlow, showAmounts)}`);
  console.log(`Movimentos analisados: ${analysis.liquidity.transactionCount}`);

  console.log("\n--- RECEITA ---");
  console.log(`Receita confirmada:       ${money(analysis.income.confirmedIncome, showAmounts)} (${analysis.income.confirmedTransactionCount} tx)`);
  console.log(`Receita baixa confiança:  ${money(analysis.income.estimatedIncome, showAmounts)} (${analysis.income.estimatedTransactionCount} tx)`);
  console.log(`Receita total estimada:   ${money(analysis.income.totalIncomeEstimate, showAmounts)}`);
  console.log(`Entradas BANK não classificadas como renda: ${money(analysis.income.unclassifiedBankInflows, showAmounts)} (${analysis.income.unclassifiedBankInflowCount} tx)`);
  console.log(`Cobertura das entradas BANK por renda classificada: ${percent(analysis.income.classifiedIncomeShareOfBankInflowsPct)}`);
  console.log(`Qualidade da renda:       ${analysis.income.quality}`);

  console.log("\n--- SPENDING SEM DUPLA CONTAGEM ---");
  console.log(`Gastos via BANK:       ${money(analysis.spending.bankSpending, showAmounts)}`);
  console.log(`Compras no cartão:     ${money(analysis.spending.cardPurchases, showAmounts)}`);
  console.log(`Spending bruto:        ${money(analysis.spending.grossSpending, showAmounts)}`);
  console.log(`Estornos/cashbacks:    ${money(analysis.spending.knownCardRefunds, showAmounts)}`);
  console.log(`Spending líquido:      ${money(analysis.spending.netSpending, showAmounts)}`);
  console.log(`Transações de gasto:   ${analysis.spending.transactionCount}`);

  console.log("\n--- SAVINGS ESTIMADO ---");
  console.log(`Poupança estimada:     ${money(analysis.savings.estimatedSavings, showAmounts)}`);
  console.log(`Savings rate estimado: ${percent(analysis.savings.estimatedSavingsRatePct)}`);
  if (!analysis.savings.available && analysis.savings.unavailableReason) {
    console.log(`Motivo:                 ${analysis.savings.unavailableReason}`);
  }

  console.log("\n--- TOP CATEGORIAS DE SPENDING ---");
  for (const entry of analysis.spending.expensesByCategory.slice(0, 10)) {
    console.log(`  ${entry.category.padEnd(16)} ${money(entry.amount, showAmounts)}`);
  }

  console.log("\n--- PROTEÇÕES CONTRA DUPLA CONTAGEM ---");
  console.log(`Transferências próprias excluídas:      ${analysis.diagnostics.internalTransfersExcluded}`);
  console.log(`Pagamentos de fatura excluídos:         ${analysis.diagnostics.creditCardPaymentsExcludedFromSpending}`);
  console.log(`Movimentos de investimento excluídos:   ${analysis.diagnostics.investmentMovementsExcludedFromSpending}`);
  console.log(`Financiamentos excluídos de spending:   ${analysis.diagnostics.loanOrFinancingExcludedFromSpending}`);
  console.log(`Estornos/cashbacks aplicados:            ${analysis.diagnostics.cardRefundsApplied}`);
  console.log(`Créditos de cartão não classificados:    ${analysis.diagnostics.unclassifiedCardCredits}`);

  console.log("\n--- QUALIDADE ---");
  console.log(`Entradas de baixa confiança: ${analysis.diagnostics.lowConfidenceIncomeTransactions}`);
  console.log(`Spending em other:           ${analysis.diagnostics.otherSpendingTransactions} (${analysis.diagnostics.otherSpendingPct.toFixed(1)}%)`);

  if (analysis.diagnostics.unclassifiedCardCredits > 0) {
    console.log("  aviso: créditos de cartão não reconhecidos como estorno/cashback não foram subtraídos do spending para evitar assumir uma semântica incorreta.");
  }

  if (analysis.income.quality === "insufficient") {
    console.log("  aviso: nenhuma renda foi confirmada; savings/savings rate foram ocultados para evitar uma estimativa enganosa.");
  } else if (analysis.income.quality === "partial") {
    console.log("  aviso: a renda está parcialmente classificada; savings rate deve ser tratado como estimativa.");
  }

  if (analysis.diagnostics.otherSpendingPct > 40) {
    console.log("  aviso: muitas despesas continuam em `other`; a qualidade de categorias ainda pode ser melhorada sem alterar a lógica anti-dupla-contagem.");
  }

  console.log("\nCiclo 6.4.1 concluído: Financial Engine separa liquidez/spending e agora também bloqueia savings rate quando a renda não tem evidência suficiente.");
  if (analysis.income.quality === "insufficient") {
    console.log("Ciclo 7 pode usar estes dados desde que respeite income.quality=insufficient e savings.available=false; o quality grounding implementa essa proteção.");
  } else {
    console.log("Próximo passo (Ciclo 7): deixar o Agent consultar dados reais com escopo controlado e quality grounding.");
  }
}

main().catch((error) => {
  console.error("Falha no Ciclo 6.4:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
