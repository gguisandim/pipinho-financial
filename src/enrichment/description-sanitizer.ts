import { createHash } from "node:crypto";

export interface SanitizedDescription {
  sanitized: string;
  fingerprint: string;
  llmEligible: boolean;
  privacyFlags: string[];
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeTransactionDescription(
  description: string,
): SanitizedDescription {
  const flags = new Set<string>();
  let value = normalize(description || "sem descricao");

  if (/https?:\/\//i.test(value) || /\bwww\./i.test(value)) {
    flags.add("url");
    value = value.replace(/https?:\/\/\S+|\bwww\.\S+/gi, "<url>");
  }

  if (/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i.test(value)) {
    flags.add("email");
    value = value.replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/gi, "<email>");
  }

  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(value)) {
    flags.add("uuid");
    value = value.replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      "<id>",
    );
  }

  if (/\b\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[-\s]?\d{2}\b|\b\d{2}[.\s-]?\d{3}[.\s-]?\d{3}[\/\s-]?\d{4}[-\s]?\d{2}\b/.test(value)) {
    flags.add("document");
    value = value.replace(
      /\b\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[-\s]?\d{2}\b|\b\d{2}[.\s-]?\d{3}[.\s-]?\d{3}[\/\s-]?\d{4}[-\s]?\d{2}\b/g,
      "<doc>",
    );
  }

  if (/\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b/.test(value)) {
    flags.add("phone");
    value = value.replace(
      /\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b/g,
      "<phone>",
    );
  }

  if (/\b\d{4,}\b/.test(value)) {
    flags.add("long_number");
    value = value.replace(/\b\d{4,}\b/g, "<num>");
  }

  // Datas, parcelas, NSUs e números pequenos variáveis tendem a fragmentar o
  // agrupamento de merchant sem adicionar sinal semântico útil.
  value = value
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, "<date>")
    .replace(/\b\d+\s*[xX]\s*\d+\b/g, "<installment>")
    .replace(/\b\d+\b/g, "#")
    .replace(/[^a-z0-9<># ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // PIX/transferências frequentemente carregam nome de pessoa física. Para o
  // laboratório cloud, não enviamos esse grupo ao LLM por padrão.
  const looksLikePersonToPersonTransfer =
    /\b(pix|ted|doc|transferencia|transfer|transf)\b/i.test(value);
  if (looksLikePersonToPersonTransfer) flags.add("transfer_context");

  const llmEligible =
    value.length >= 3 &&
    !looksLikePersonToPersonTransfer &&
    !flags.has("email") &&
    !flags.has("document") &&
    !flags.has("phone");

  const fingerprint = createHash("sha256")
    .update(value || "sem descricao")
    .digest("hex")
    .slice(0, 16);

  return {
    sanitized: value || "sem descricao",
    fingerprint,
    llmEligible,
    privacyFlags: [...flags].sort(),
  };
}
