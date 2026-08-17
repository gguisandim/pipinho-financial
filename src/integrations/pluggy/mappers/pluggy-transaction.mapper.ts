import type {
  CategorySource,
  Transaction,
  TransactionCategory,
  TransactionRole,
  TransactionType,
} from "../../../domain/finance.js";
import type {
  PluggyAccount,
  PluggyTransaction,
} from "../pluggy-data.schemas.js";

export interface PluggyTransactionMapperContext {
  account: PluggyAccount;
  institution: string;
  itemId: string;
  timeZone?: string;
}

export type PluggyTransactionMapResult =
  | { ok: true; transaction: Transaction }
  | { ok: false; reason: string };

interface CategoryDecision {
  category: TransactionCategory;
  source: CategorySource;
  confidence: "high" | "medium" | "low";
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function mapProviderCategory(category?: string | null): TransactionCategory | null {
  if (!category) return null;
  const value = normalizeText(category);

  // Movimentos patrimoniais/transferências não são automaticamente renda ou consumo.
  // Mantemos como `other` para o Ciclo 6.4 decidir o impacto econômico sem
  // inflar receita/despesa por transferências entre contas próprias.
  if (includesAny(value, [
    "same person transfer",
    "transfers",
    "transfer ",
    "credit card payment",
    "investments",
    "automatic investment",
    "fixed income",
    "mutual funds",
    "variable income",
    "loans and financing",
  ])) return "other";

  if (value.startsWith("income") || includesAny(value, ["salary", "retirement", "government aid", "non recurring income"])) return "income";
  if (includesAny(value, ["housing", "rent", "houseware", "urban land", "building tax"])) return "housing";
  if (includesAny(value, ["groceries"])) return "groceries";
  if (includesAny(value, ["food delivery"])) return "food_delivery";
  if (includesAny(value, ["transportation", "taxi", "ride hailing", "public transportation", "car rental", "bicycle", "gas stations", "parking", "tolls"])) return "transport";
  if (includesAny(value, ["utilities", "water", "electricity", "gas", "telecommunications", "internet", "mobile", "tv"])) return "utilities";
  if (includesAny(value, ["digital services", "video streaming", "music streaming", "gaming"])) return "subscriptions";
  if (includesAny(value, ["healthcare", "dentist", "pharmacy", "optometry", "hospital", "clinics", "labs"])) return "health";
  if (includesAny(value, ["food and drinks", "eating out", "restaurant"])) return "restaurants";
  if (includesAny(value, ["education", "online courses", "university", "school", "kindergarten", "bookstore"])) return "education";
  if (includesAny(value, ["wellness and fitness", "gyms", "fitness centers", "sports practice", "wellness"])) return "fitness";
  if (includesAny(value, ["shopping", "electronics", "clothing", "kids and toys", "sports goods", "office supplies", "pet supplies"])) return "shopping";

  return null;
}

function mapDescription(description: string): TransactionCategory | null {
  const value = normalizeText(description);

  if (includesAny(value, ["ifood", "rappi", "delivery", "ubereats", "uber eats"])) return "food_delivery";
  if (includesAny(value, ["supermercado", "mercado ", "atacadao", "assai", "carrefour", "grocery"])) return "groceries";
  if (includesAny(value, ["uber", "99app", "99 pop", "taxi", "posto ", "combustivel", "gasolina"])) return "transport";
  if (includesAny(value, ["spotify", "netflix", "deezer", "youtube premium", "amazon prime", "disney", "hbo", "max.com"])) return "subscriptions";
  if (includesAny(value, ["energia", "eletric", "internet", "claro", "vivo", "tim ", "agua", "cosanpa", "celpa", "equatorial"])) return "utilities";
  if (includesAny(value, ["farmacia", "drogasil", "droga raia", "hospital", "clinica", "laboratorio"])) return "health";
  if (includesAny(value, ["academia", "smart fit", "bluefit", "gym"])) return "fitness";
  if (includesAny(value, ["aluguel", "condominio", "moradia"])) return "housing";
  if (includesAny(value, ["faculdade", "universidade", "curso", "escola", "livro", "udemy", "alura"])) return "education";
  if (includesAny(value, ["restaurante", "lanchonete", "cafe ", "cafeteria", "burger", "pizza", "sushi"])) return "restaurants";
  if (includesAny(value, ["shopping", "amazon", "mercado livre", "shopee", "roupa", "renner", "riachuelo", "cea "])) return "shopping";

  return null;
}

function chooseCategory(
  transaction: PluggyTransaction,
  role: TransactionRole,
): CategoryDecision {
  const fromProvider = mapProviderCategory(transaction.category);
  if (fromProvider) {
    return { category: fromProvider, source: "pluggy", confidence: "high" };
  }

  const fromDescription = mapDescription(
    `${transaction.description} ${transaction.descriptionRaw ?? ""}`,
  );
  if (fromDescription) {
    return {
      category: fromDescription,
      source: "description_rule",
      confidence: "medium",
    };
  }

  if (role === "bank_inflow") {
    return {
      category: "income",
      source: "direction_fallback",
      confidence: "low",
    };
  }

  return { category: "other", source: "fallback", confidence: "low" };
}

function mapDirection(
  transaction: PluggyTransaction,
  account: PluggyAccount,
): { type: TransactionType; role: TransactionRole } | null {
  const providerType = transaction.type.toUpperCase();

  if (account.type === "BANK") {
    if (providerType === "CREDIT") return { type: "credit", role: "bank_inflow" };
    if (providerType === "DEBIT") return { type: "debit", role: "bank_outflow" };
    return null;
  }

  if (account.type === "CREDIT") {
    // Na convenção Pluggy, compras de cartão aumentam a dívida e são DEBIT;
    // créditos/pagamentos reduzem a dívida e são CREDIT. O sinal original é
    // preservado em metadata.originalAmount para auditoria.
    if (providerType === "DEBIT") return { type: "debit", role: "card_purchase" };
    if (providerType === "CREDIT") return { type: "credit", role: "card_credit" };
    return null;
  }

  return null;
}

function toLocalDate(isoDate: string, timeZone: string): string | null {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

export function mapPluggyTransaction(
  source: PluggyTransaction,
  context: PluggyTransactionMapperContext,
): PluggyTransactionMapResult {
  const direction = mapDirection(source, context.account);
  if (!direction) {
    return { ok: false, reason: `unsupported_transaction_type:${source.type}` };
  }

  const amount = Math.abs(source.amount);
  if (!Number.isFinite(amount)) {
    return { ok: false, reason: "invalid_amount" };
  }

  const date = toLocalDate(
    source.date,
    context.timeZone ?? "America/Sao_Paulo",
  );
  if (!date) return { ok: false, reason: "invalid_date" };

  const category = chooseCategory(source, direction.role);

  return {
    ok: true,
    transaction: {
      id: `pluggy:${source.id}`,
      date,
      description: source.description || source.descriptionRaw || "Sem descrição",
      amount,
      type: direction.type,
      category: category.category,
      metadata: {
        source: "pluggy",
        institution: context.institution,
        itemId: context.itemId,
        accountId: context.account.id,
        accountName: context.account.marketingName ?? context.account.name,
        accountType: context.account.type,
        accountSubtype: context.account.subtype,
        currencyCode: source.currencyCode,
        providerCategory: source.category ?? null,
        providerCategoryId: source.categoryId ?? null,
        providerId: source.providerId ?? null,
        operationType: source.operationType ?? null,
        originalAmount: source.amount,
        role: direction.role,
        status: source.status === "PENDING" ? "pending" : "posted",
        categorySource: category.source,
        categoryConfidence: category.confidence,
      },
    },
  };
}
