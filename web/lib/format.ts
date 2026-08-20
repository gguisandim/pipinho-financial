export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
}

export function formatDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

export function formatMonth(value: string): string {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, 1);
  return new Intl.DateTimeFormat("pt-BR", { month: "short" })
    .format(date)
    .replace(".", "");
}

export function labelCategory(category: string): string {
  const labels: Record<string, string> = {
    food: "Alimentação",
    groceries: "Mercado",
    transport: "Transporte",
    shopping: "Compras",
    housing: "Moradia",
    utilities: "Contas",
    health: "Saúde",
    education: "Educação",
    entertainment: "Lazer",
    travel: "Viagens",
    subscriptions: "Assinaturas",
    financial_charges: "Encargos",
    other: "Outros",
    income: "Renda",
  };
  return labels[category] ?? category.replaceAll("_", " ");
}
