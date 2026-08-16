import type { Transaction } from "../domain/finance.js";

export const syntheticTransactions: Transaction[] = [
  { id: "tx-001", date: "2026-08-01", description: "Salário", amount: 5200, type: "credit", category: "income" },
  { id: "tx-002", date: "2026-08-03", description: "Freelance landing page", amount: 450, type: "credit", category: "income" },
  { id: "tx-003", date: "2026-08-02", description: "Aluguel", amount: 1400, type: "debit", category: "housing" },
  { id: "tx-004", date: "2026-08-04", description: "Supermercado", amount: 386.74, type: "debit", category: "groceries" },
  { id: "tx-005", date: "2026-08-05", description: "iFood", amount: 64.9, type: "debit", category: "food_delivery" },
  { id: "tx-006", date: "2026-08-06", description: "Uber", amount: 29.5, type: "debit", category: "transport" },
  { id: "tx-007", date: "2026-08-07", description: "Energia elétrica", amount: 178.22, type: "debit", category: "utilities" },
  { id: "tx-008", date: "2026-08-08", description: "Internet", amount: 119.9, type: "debit", category: "utilities" },
  { id: "tx-009", date: "2026-08-09", description: "Spotify", amount: 21.9, type: "debit", category: "subscriptions" },
  { id: "tx-010", date: "2026-08-10", description: "Farmácia", amount: 82.3, type: "debit", category: "health" },
  { id: "tx-011", date: "2026-08-11", description: "Restaurante", amount: 126, type: "debit", category: "restaurants" },
  { id: "tx-012", date: "2026-08-12", description: "Livros", amount: 95, type: "debit", category: "education" },
  { id: "tx-013", date: "2026-08-13", description: "Academia", amount: 89.9, type: "debit", category: "fitness" },
  { id: "tx-014", date: "2026-08-14", description: "Roupa", amount: 210, type: "debit", category: "shopping" }
];
