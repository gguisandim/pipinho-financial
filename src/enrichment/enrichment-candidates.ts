import type { Transaction } from "../domain/finance.js";
import { classifyFinancialMovement } from "../financial-engine/real-views.js";
import { sanitizeTransactionDescription } from "./description-sanitizer.js";

export type EnrichmentCandidateKind = "expense_category" | "bank_inflow";

export interface EnrichmentCandidate {
  id: string;
  kind: EnrichmentCandidateKind;
  fingerprint: string;
  sanitizedDescription: string;
  occurrenceCount: number;
  institutions: string[];
  roles: string[];
  providerCategories: string[];
  llmEligible: boolean;
  privacyFlags: string[];
}

interface MutableCandidate extends EnrichmentCandidate {
  institutionsSet: Set<string>;
  rolesSet: Set<string>;
  providerCategoriesSet: Set<string>;
  privacyFlagsSet: Set<string>;
}

function candidateId(kind: EnrichmentCandidateKind, fingerprint: string) {
  return `${kind === "expense_category" ? "exp" : "in"}-${fingerprint}`;
}

function finalize(candidate: MutableCandidate): EnrichmentCandidate {
  return {
    id: candidate.id,
    kind: candidate.kind,
    fingerprint: candidate.fingerprint,
    sanitizedDescription: candidate.sanitizedDescription,
    occurrenceCount: candidate.occurrenceCount,
    institutions: [...candidate.institutionsSet].sort(),
    roles: [...candidate.rolesSet].sort(),
    providerCategories: [...candidate.providerCategoriesSet].sort(),
    llmEligible: candidate.llmEligible,
    privacyFlags: [...candidate.privacyFlagsSet].sort(),
  };
}

function addToGroup(
  groups: Map<string, MutableCandidate>,
  kind: EnrichmentCandidateKind,
  transaction: Transaction,
) {
  const sanitized = sanitizeTransactionDescription(transaction.description);
  const key = `${kind}:${sanitized.fingerprint}`;
  const existing = groups.get(key);
  const institution = transaction.metadata?.institution;
  const role = transaction.metadata?.role;
  const providerCategory = transaction.metadata?.providerCategory;

  if (existing) {
    existing.occurrenceCount += 1;
    if (institution) existing.institutionsSet.add(institution);
    if (role) existing.rolesSet.add(role);
    if (providerCategory) existing.providerCategoriesSet.add(providerCategory);
    for (const flag of sanitized.privacyFlags) existing.privacyFlagsSet.add(flag);
    existing.llmEligible &&= sanitized.llmEligible;
    return;
  }

  groups.set(key, {
    id: candidateId(kind, sanitized.fingerprint),
    kind,
    fingerprint: sanitized.fingerprint,
    sanitizedDescription: sanitized.sanitized,
    occurrenceCount: 1,
    institutions: [],
    roles: [],
    providerCategories: [],
    llmEligible: sanitized.llmEligible,
    privacyFlags: sanitized.privacyFlags,
    institutionsSet: new Set(institution ? [institution] : []),
    rolesSet: new Set(role ? [role] : []),
    providerCategoriesSet: new Set(providerCategory ? [providerCategory] : []),
    privacyFlagsSet: new Set(sanitized.privacyFlags),
  });
}

export function buildEnrichmentCandidates(transactions: Transaction[]): {
  expenseCandidates: EnrichmentCandidate[];
  inflowCandidates: EnrichmentCandidate[];
} {
  const expenseGroups = new Map<string, MutableCandidate>();
  const inflowGroups = new Map<string, MutableCandidate>();

  for (const transaction of transactions) {
    const movement = classifyFinancialMovement(transaction);

    if (movement === "spending" && transaction.category === "other") {
      addToGroup(expenseGroups, "expense_category", transaction);
      continue;
    }

    if (
      transaction.metadata?.role === "bank_inflow" &&
      (movement === "liquidity_only" || movement === "estimated_income")
    ) {
      addToGroup(inflowGroups, "bank_inflow", transaction);
    }
  }

  const byCount = (a: EnrichmentCandidate, b: EnrichmentCandidate) =>
    b.occurrenceCount - a.occurrenceCount || a.id.localeCompare(b.id);

  return {
    expenseCandidates: [...expenseGroups.values()].map(finalize).sort(byCount),
    inflowCandidates: [...inflowGroups.values()].map(finalize).sort(byCount),
  };
}
