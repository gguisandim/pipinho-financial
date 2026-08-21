import type { ConversationHistoryMessage } from "../agent/conversation-context.js";
import type { FinancialToolRoutingDecision } from "../agent/financial-tool-router.js";

export type ConversationBenchmarkCategory =
  | "conversation"
  | "spending"
  | "balances"
  | "income"
  | "savings"
  | "categories"
  | "institutions"
  | "recent_transactions"
  | "transaction_search"
  | "daily_spending"
  | "largest_expenses"
  | "capabilities"
  | "follow_up";

export interface ConversationBenchmarkCase {
  id: string;
  category: ConversationBenchmarkCategory;
  question: string;
  expectedIntent: FinancialToolRoutingDecision["intent"];
  expectedTools: string[];
  forbiddenTools?: string[];
  history?: ConversationHistoryMessage[];
  memorySummary?: string;
  expectedContextualRouting?: boolean;
  expectedArguments?: Record<string, unknown>;
  real?: boolean;
  maxExecutedTools?: number;
  answerMustIndicateLimitation?: boolean;
}

const spendingHistory: ConversationHistoryMessage[] = [
  { role: "user", content: "Quanto eu gastei este mês?" },
  { role: "assistant", content: "Você gastou R$ X neste mês." },
];

const julySpendingHistory: ConversationHistoryMessage[] = [
  { role: "user", content: "Quanto eu gastei em julho?" },
  { role: "assistant", content: "Você gastou R$ X em julho." },
];

const balanceHistory: ConversationHistoryMessage[] = [
  { role: "user", content: "Quanto eu tenho agora?" },
  { role: "assistant", content: "Seu saldo bancário é R$ X." },
];

export const conversationBenchmarkReferenceDate = "2026-08-20";

export const conversationBenchmarkCases: ConversationBenchmarkCase[] = [
  // Conversa sem acesso financeiro desnecessário.
  { id: "conv-oi", category: "conversation", question: "oi", expectedIntent: "conversation", expectedTools: [], real: true },
  { id: "conv-ola", category: "conversation", question: "olá!", expectedIntent: "conversation", expectedTools: [] },
  { id: "conv-salve", category: "conversation", question: "salve pipinho", expectedIntent: "conversation", expectedTools: [] },
  { id: "conv-fala", category: "conversation", question: "fala pipinho", expectedIntent: "conversation", expectedTools: [] },
  { id: "conv-oque-faz", category: "conversation", question: "o que vc faz?", expectedIntent: "conversation", expectedTools: [] },
  { id: "conv-valeu", category: "conversation", question: "valeu", expectedIntent: "conversation", expectedTools: [] },

  // Gastos e períodos em linguagem natural.
  { id: "spend-mes", category: "spending", question: "quanto eu gastei esse mês?", expectedIntent: "spending", expectedTools: ["get_spending_summary"], expectedArguments: { startDate: "2026-08-01", endDate: "2026-08-20" }, real: true },
  { id: "spend-ontem", category: "spending", question: "quanto gastei ontem?", expectedIntent: "spending", expectedTools: ["get_spending_summary"], expectedArguments: { startDate: "2026-08-19", endDate: "2026-08-19" }, real: true },
  { id: "spend-semana", category: "spending", question: "qual foi meu gasto essa semana?", expectedIntent: "spending", expectedTools: ["get_spending_summary"], expectedArguments: { startDate: "2026-08-17", endDate: "2026-08-20" } },
  { id: "spend-torrei", category: "spending", question: "quanto eu torrei esse mês?", expectedIntent: "spending", expectedTools: ["get_spending_summary"], expectedArguments: { startDate: "2026-08-01", endDate: "2026-08-20" } },
  { id: "spend-despesa", category: "spending", question: "qual foi a despesa total de agosto?", expectedIntent: "spending", expectedTools: ["get_spending_summary"], expectedArguments: { startDate: "2026-08-01", endDate: "2026-08-31" } },

  // Saldo e aliases.
  { id: "balance-agora", category: "balances", question: "quanto eu tenho agora?", expectedIntent: "balances", expectedTools: ["get_account_balances"], real: true },
  { id: "balance-saldo", category: "balances", question: "qual meu saldo?", expectedIntent: "balances", expectedTools: ["get_account_balances"] },
  { id: "balance-roxinho", category: "balances", question: "quanto tem no roxinho?", expectedIntent: "balances", expectedTools: ["get_account_balances"], expectedArguments: { institution: "Nubank" }, real: true },
  { id: "balance-nu", category: "balances", question: "qnt tenho no nu?", expectedIntent: "balances", expectedTools: ["get_account_balances"], expectedArguments: { institution: "Nubank" } },
  { id: "balance-nubnak", category: "balances", question: "quanto tenho no nubnak?", expectedIntent: "balances", expectedTools: ["get_account_balances"], expectedArguments: { institution: "Nubank" } },
  { id: "balance-pic-pay", category: "balances", question: "dinheiro disponível no pic pay", expectedIntent: "balances", expectedTools: ["get_account_balances"], expectedArguments: { institution: "PicPay" } },

  // Renda e poupança.
  { id: "income-renda", category: "income", question: "qual minha renda esse mês?", expectedIntent: "income", expectedTools: ["get_income"], expectedArguments: { startDate: "2026-08-01", endDate: "2026-08-20" } },
  { id: "income-entrou", category: "income", question: "quanto entrou esse mês?", expectedIntent: "income", expectedTools: ["get_income"], expectedArguments: { startDate: "2026-08-01", endDate: "2026-08-20" }, real: true },
  { id: "income-ganhei", category: "income", question: "quanto eu ganhei em julho?", expectedIntent: "income", expectedTools: ["get_income"], expectedArguments: { startDate: "2026-07-01", endDate: "2026-07-31" } },
  { id: "save-economizei", category: "savings", question: "quanto eu economizei esse mês?", expectedIntent: "savings", expectedTools: ["get_savings_status"], expectedArguments: { startDate: "2026-08-01", endDate: "2026-08-20" } },
  { id: "save-taxa", category: "savings", question: "como tá minha taxa de poupança?", expectedIntent: "savings", expectedTools: ["get_savings_status"] },

  // Categorias.
  { id: "cat-onde", category: "categories", question: "onde eu tô gastando mais?", expectedIntent: "categories", expectedTools: ["get_spending_by_category"], real: true },
  { id: "cat-comida", category: "categories", question: "quanto gastei com comida em agosto?", expectedIntent: "categories", expectedTools: ["get_spending_by_category"], expectedArguments: { startDate: "2026-08-01", endDate: "2026-08-31" } },
  { id: "cat-uber-general", category: "categories", question: "quanto foi de transporte esse mês?", expectedIntent: "categories", expectedTools: ["get_spending_by_category"], expectedArguments: { startDate: "2026-08-01", endDate: "2026-08-20" } },
  { id: "cat-assinatura", category: "categories", question: "tô gastando muito com assinatura?", expectedIntent: "categories", expectedTools: ["get_spending_by_category"] },

  // Instituição deve ser distinta de saldo.
  { id: "inst-nubank", category: "institutions", question: "quanto eu gastei no Nubank esse mês?", expectedIntent: "institutions", expectedTools: ["get_spending_by_institution"], expectedArguments: { institution: "Nubank", startDate: "2026-08-01", endDate: "2026-08-20" }, real: true },
  { id: "inst-roxinho", category: "institutions", question: "quanto gastei no roxinho?", expectedIntent: "institutions", expectedTools: ["get_spending_by_institution"], expectedArguments: { institution: "Nubank" } },
  { id: "inst-neon", category: "institutions", question: "meus gastos no banco neon", expectedIntent: "institutions", expectedTools: ["get_spending_by_institution"], expectedArguments: { institution: "Neon" } },
  { id: "inst-picpay", category: "institutions", question: "gastos pelo pic pay em julho", expectedIntent: "institutions", expectedTools: ["get_spending_by_institution"], expectedArguments: { institution: "PicPay", startDate: "2026-07-01", endDate: "2026-07-31" } },

  // Recentes e busca textual.
  { id: "recent-ultimo", category: "recent_transactions", question: "qual foi meu último gasto?", expectedIntent: "recent_transactions", expectedTools: ["get_recent_transactions"], real: true },
  { id: "recent-ultimas", category: "recent_transactions", question: "me mostra minhas últimas compras", expectedIntent: "recent_transactions", expectedTools: ["get_recent_transactions"] },
  { id: "recent-mov", category: "recent_transactions", question: "quais minhas movimentações recentes?", expectedIntent: "recent_transactions", expectedTools: ["get_recent_transactions"] },
  { id: "search-uber", category: "transaction_search", question: "quanto foi aquele Uber de ontem?", expectedIntent: "transaction_search", expectedTools: ["search_transactions"], expectedArguments: { startDate: "2026-08-19", endDate: "2026-08-19" }, real: true, maxExecutedTools: 2 },
  { id: "search-uberr", category: "transaction_search", question: "quanto foi aquele Uberr de ontem?", expectedIntent: "transaction_search", expectedTools: ["search_transactions"], expectedArguments: { startDate: "2026-08-19", endDate: "2026-08-19" }, real: true, maxExecutedTools: 2 },
  { id: "search-ifood", category: "transaction_search", question: "procura meus pagamentos do ifood", expectedIntent: "transaction_search", expectedTools: ["search_transactions"] },
  { id: "search-aquela", category: "transaction_search", question: "acha aquela compra do mercado", expectedIntent: "transaction_search", expectedTools: ["search_transactions"] },

  // Perfil diário.
  { id: "daily-costumo", category: "daily_spending", question: "quanto eu costumo gastar por dia?", expectedIntent: "daily_spending", expectedTools: ["get_daily_spending_summary"], expectedArguments: { startDate: "2026-05-23", endDate: "2026-08-20" }, real: true },
  { id: "daily-media", category: "daily_spending", question: "qual minha média diária de gastos?", expectedIntent: "daily_spending", expectedTools: ["get_daily_spending_summary"], expectedArguments: { startDate: "2026-05-23", endDate: "2026-08-20" } },

  // Maiores gastos.
  { id: "largest-compra", category: "largest_expenses", question: "qual foi minha compra mais cara?", expectedIntent: "largest_expenses", expectedTools: ["get_largest_expenses"] },
  { id: "largest-gastos", category: "largest_expenses", question: "quais foram meus maiores gastos em julho?", expectedIntent: "largest_expenses", expectedTools: ["get_largest_expenses"], expectedArguments: { startDate: "2026-07-01", endDate: "2026-07-31" } },

  // Perguntas que o dataset não garante: devem declarar limitação via capabilities.
  { id: "cap-invest", category: "capabilities", question: "quanto eu tenho investido?", expectedIntent: "capabilities", expectedTools: ["get_data_capabilities"], forbiddenTools: ["get_account_balances"], answerMustIndicateLimitation: true, real: true },
  { id: "cap-limite", category: "capabilities", question: "qual é meu limite do cartão?", expectedIntent: "capabilities", expectedTools: ["get_data_capabilities"], answerMustIndicateLimitation: true, real: true },
  { id: "cap-fatura", category: "capabilities", question: "quanto tá minha fatura atual?", expectedIntent: "capabilities", expectedTools: ["get_data_capabilities"], answerMustIndicateLimitation: true },
  { id: "cap-score", category: "capabilities", question: "qual meu score de crédito?", expectedIntent: "capabilities", expectedTools: ["get_data_capabilities"], answerMustIndicateLimitation: true, real: true },
  { id: "cap-emprestimo", category: "capabilities", question: "quanto falta do meu empréstimo?", expectedIntent: "capabilities", expectedTools: ["get_data_capabilities"], answerMustIndicateLimitation: true },

  // Follow-ups com histórico curto.
  { id: "follow-month", category: "follow_up", question: "e mês passado?", expectedIntent: "spending", expectedTools: ["get_spending_summary"], history: spendingHistory, expectedContextualRouting: true, expectedArguments: { startDate: "2026-07-01", endDate: "2026-07-31" }, real: true },
  { id: "follow-inst", category: "follow_up", question: "e no roxinho?", expectedIntent: "institutions", expectedTools: ["get_spending_by_institution"], history: julySpendingHistory, expectedContextualRouting: true, expectedArguments: { institution: "Nubank", startDate: "2026-07-01", endDate: "2026-07-31" }, real: true },
  { id: "follow-balance", category: "follow_up", question: "e no neon?", expectedIntent: "balances", expectedTools: ["get_account_balances"], history: balanceHistory, expectedContextualRouting: true, expectedArguments: { institution: "Neon" }, real: true },
  { id: "follow-yesterday", category: "follow_up", question: "e ontem?", expectedIntent: "spending", expectedTools: ["get_spending_summary"], history: spendingHistory, expectedContextualRouting: true, expectedArguments: { startDate: "2026-08-19", endDate: "2026-08-19" } },
  { id: "follow-memory", category: "follow_up", question: "e no pic pay?", expectedIntent: "balances", expectedTools: ["get_account_balances"], memorySummary: "Perguntas anteriores desta conversa: Quanto eu tenho agora?", expectedContextualRouting: true, expectedArguments: { institution: "PicPay" }, real: true },
];

export const realConversationBenchmarkCases = conversationBenchmarkCases.filter(
  (testCase) => testCase.real,
);
