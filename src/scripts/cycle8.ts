import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { env } from "../config/env.js";
import { createPluggyTransactionRepository } from "../integrations/pluggy/pluggy.factory.js";
import { GroqStructuredProvider } from "../llm/providers/groq-structured.provider.js";
import { TransactionEnrichmentService } from "../services/transaction-enrichment.service.js";

const args = process.argv.slice(2);
const noLlm = args.includes("--no-llm") || env.ENRICHMENT_USE_LLM !== "true";
const showDescriptions =
  args.includes("--show-descriptions") || env.ENRICHMENT_SHOW_DESCRIPTIONS === "true";

function argNumber(flag: string, fallback: number) {
  const index = args.indexOf(flag);
  if (index < 0) return fallback;
  const value = Number(args[index + 1]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

const minOccurrences = argNumber(
  "--min-occurrences",
  env.ENRICHMENT_MIN_OCCURRENCES,
);
const maxExpenseGroups = argNumber(
  "--max-expense-groups",
  env.ENRICHMENT_MAX_EXPENSE_GROUPS,
);
const maxInflowGroups = argNumber(
  "--max-inflow-groups",
  env.ENRICHMENT_MAX_INFLOW_GROUPS,
);

const repository = createPluggyTransactionRepository();
const classifier = noLlm ? undefined : new GroqStructuredProvider();
const service = new TransactionEnrichmentService(repository, classifier);

console.log("=== CICLO 8: DATA ENRICHMENT + LLM CLASSIFICATION ===");
console.log("Fonte: PluggyTransactionRepository");
console.log(`LLM para despesas: ${noLlm ? "desativado" : "Groq Structured Outputs"}`);
console.log("LLM para entradas BANK: desativado por padrão (human-in-the-loop)");
console.log(`Descrições no terminal/relatório: ${showDescriptions ? "visíveis localmente" : "ocultadas"}`);
console.log(`Mín. ocorrências por grupo: ${minOccurrences}`);
console.log(`Máx. grupos de despesas enviados ao LLM: ${maxExpenseGroups}`);
console.log(`Tamanho de lote LLM: ${env.ENRICHMENT_BATCH_SIZE}`);
console.log(`Máx. completion tokens/lote: ${env.ENRICHMENT_MAX_COMPLETION_TOKENS}\n`);

const scan = await service.scan({
  minOccurrences,
  maxExpenseGroups,
  maxInflowGroups,
});
const classification = await service.classifyExpenses(scan, {
  batchSize: env.ENRICHMENT_BATCH_SIZE,
  maxCompletionTokens: env.ENRICHMENT_MAX_COMPLETION_TOKENS,
});

const totalOtherTransactions = scan.expenseCandidates.reduce(
  (sum, candidate) => sum + candidate.occurrenceCount,
  0,
);
const eligibleTransactions = scan.eligibleExpenseCandidates.reduce(
  (sum, candidate) => sum + candidate.occurrenceCount,
  0,
);
const suggestedUsefulIds = new Set(
  (classification?.suggestions ?? [])
    .filter(
      (suggestion) =>
        suggestion.category !== "other" && suggestion.confidence !== "low",
    )
    .map((suggestion) => suggestion.candidateId),
);
const suggestedCoverageTransactions = scan.eligibleExpenseCandidates
  .filter((candidate) => suggestedUsefulIds.has(candidate.id))
  .reduce((sum, candidate) => sum + candidate.occurrenceCount, 0);

console.log("--- SCAN DE QUALIDADE ---");
console.log(`Transações canônicas:                     ${scan.transactionCount}`);
console.log(`Grupos de spending em other:              ${scan.expenseCandidates.length}`);
console.log(`Transações representadas nesses grupos:   ${totalOtherTransactions}`);
console.log(`Grupos elegíveis para LLM nesta execução: ${scan.eligibleExpenseCandidates.length}`);
console.log(`Transações cobertas pelos grupos enviados:${eligibleTransactions}`);
console.log(`Grupos de entradas BANK para revisão:     ${scan.inflowCandidates.length}`);

console.log("\n--- CANDIDATOS DE DESPESA ---");
if (scan.eligibleExpenseCandidates.length === 0) {
  console.log("Nenhum grupo repetido/seguro elegível para classificação remota.");
} else {
  for (const candidate of scan.eligibleExpenseCandidates) {
    const description = showDescriptions
      ? ` | ${candidate.sanitizedDescription}`
      : "";
    console.log(
      `${candidate.id} | ${candidate.occurrenceCount} tx | privacy=${candidate.privacyFlags.join(",") || "ok"}${description}`,
    );
  }
}

console.log("\n--- SUGESTÕES LLM (NÃO APLICADAS AUTOMATICAMENTE) ---");
if (!classification) {
  console.log(
    noLlm
      ? "Classificação LLM desativada. Use sem --no-llm e mantenha GROQ_API_KEY configurada."
      : "Nenhum candidato elegível para classificar.",
  );
} else {
  console.log(
    `Provider/modelo: ${classification.provider}/${classification.model} | ${classification.batchCount} lote(s) | ${classification.latencyMs} ms | ${classification.usage.totalTokens ?? "n/d"} tokens`,
  );
  for (const suggestion of classification.suggestions) {
    const reason = showDescriptions ? ` | ${suggestion.reason}` : "";
    console.log(
      `${suggestion.candidateId} → ${suggestion.category} (${suggestion.confidence})${reason}`,
    );
  }
  if (classification.invalidSuggestionIds.length > 0) {
    console.log(
      `IDs inválidos ignorados: ${classification.invalidSuggestionIds.join(", ")}`,
    );
  }
  if (classification.missingCandidateIds.length > 0) {
    console.log(
      `Candidatos sem resposta: ${classification.missingCandidateIds.join(", ")}`,
    );
  }
  console.log(
    `Cobertura potencial por sugestões medium/high ≠ other: ${suggestedCoverageTransactions}/${totalOtherTransactions} transações atualmente em other.`,
  );
}

console.log("\n--- ENTRADAS BANK: HUMAN-IN-THE-LOOP ---");
console.log(
  "Nenhuma entrada bancária foi enviada ao LLM. Esses grupos podem conter nomes de pessoas/PIX e também não devem virar renda confirmada sem validação humana.",
);
for (const candidate of scan.inflowCandidates.slice(0, maxInflowGroups)) {
  const description = showDescriptions
    ? ` | ${candidate.sanitizedDescription}`
    : "";
  console.log(
    `${candidate.id} | ${candidate.occurrenceCount} tx | llmEligible=${candidate.llmEligible}${description}`,
  );
}

const reportDir = resolve("reports", "enrichment");
await mkdir(reportDir, { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  source: scan.source,
  fetchedAt: scan.fetchedAt,
  configuration: {
    minOccurrences,
    maxExpenseGroups,
    maxInflowGroups,
    llmEnabled: !noLlm,
    showDescriptions,
    inflowLlmEnabled: false,
  },
  summary: {
    transactionCount: scan.transactionCount,
    otherExpenseGroupCount: scan.expenseCandidates.length,
    otherExpenseTransactionCount: totalOtherTransactions,
    eligibleExpenseGroupCount: scan.eligibleExpenseCandidates.length,
    eligibleExpenseTransactionCount: eligibleTransactions,
    suggestedCoverageTransactions,
    inflowCandidateGroupCount: scan.inflowCandidates.length,
  },
  expenseCandidates: scan.eligibleExpenseCandidates.map((candidate) => ({
    id: candidate.id,
    occurrenceCount: candidate.occurrenceCount,
    llmEligible: candidate.llmEligible,
    privacyFlags: candidate.privacyFlags,
    ...(showDescriptions
      ? { sanitizedDescription: candidate.sanitizedDescription }
      : {}),
  })),
  suggestions: (classification?.suggestions ?? []).map((suggestion) => ({
    candidateId: suggestion.candidateId,
    category: suggestion.category,
    confidence: suggestion.confidence,
    ...(showDescriptions ? { reason: suggestion.reason } : {}),
    approved: false,
  })),
  inflowCandidates: scan.inflowCandidates.map((candidate) => ({
    id: candidate.id,
    occurrenceCount: candidate.occurrenceCount,
    llmEligible: candidate.llmEligible,
    privacyFlags: candidate.privacyFlags,
    ...(showDescriptions
      ? { sanitizedDescription: candidate.sanitizedDescription }
      : {}),
  })),
  safety: {
    rawAmountsSentToLlm: false,
    rawAccountIdsSentToLlm: false,
    rawItemIdsSentToLlm: false,
    inflowDescriptionsSentToLlm: false,
    suggestionsAutoApplied: false,
  },
};

const latestJson = resolve(reportDir, "latest.json");
await writeFile(latestJson, JSON.stringify(report, null, 2), "utf8");

const template = {
  version: 1,
  generatedAt: report.generatedAt,
  expenseCategoryOverrides: (classification?.suggestions ?? []).map(
    (suggestion) => ({
      candidateId: suggestion.candidateId,
      category: suggestion.category,
      confidence: suggestion.confidence,
      approved: false,
    }),
  ),
  incomeOverrides: scan.inflowCandidates.map((candidate) => ({
    candidateId: candidate.id,
    classification: "unreviewed",
    approved: false,
  })),
};
const templatePath = resolve(reportDir, "overrides-template.json");
await writeFile(templatePath, JSON.stringify(template, null, 2), "utf8");

console.log("\n--- SEGURANÇA ---");
console.log("Valores enviados ao LLM:             não");
console.log("accountId/itemId enviados ao LLM:    não");
console.log("Entradas BANK enviadas ao LLM:       não");
console.log("Sugestões aplicadas automaticamente: não");
console.log(`Relatório: ${latestJson}`);
console.log(`Template de revisão: ${templatePath}`);
console.log("\nCiclo 8 concluído: o LLM propõe enriquecimento de despesas de forma minimizada, mas o domínio financeiro não é alterado sem aprovação.");
