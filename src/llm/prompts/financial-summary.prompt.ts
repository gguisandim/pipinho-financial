import type { FinancialSummary } from "../../domain/finance.js";

export const FINANCIAL_SYSTEM_PROMPT = `Você é um assistente experimental de análise financeira pessoal.
Use somente os números fornecidos pela aplicação.
Não invente saldos, transações, categorias, tendências ou projeções.
Não refaça cálculos financeiros se o resultado já tiver sido fornecido pelo backend.
Quando os dados forem insuficientes, diga explicitamente que não há informação suficiente.
Responda em português do Brasil, de forma objetiva, separando fatos observados de sugestões.`;

export function buildFinancialSummaryPrompt(
  summary: FinancialSummary,
  question: string,
): string {
  return `A aplicação calculou deterministicamente o seguinte resumo financeiro:\n\n${JSON.stringify(
    summary,
    null,
    2,
  )}\n\nPergunta do usuário: ${question}\n\nInterprete apenas o resumo acima.`;
}
