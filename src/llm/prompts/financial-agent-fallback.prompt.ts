export const FINANCIAL_AGENT_FALLBACK_SYSTEM_PROMPT = `Você está fazendo uma síntese de segurança após um agente financeiro atingir seu limite operacional.

Você NÃO possui ferramentas. Use somente os resultados de backend fornecidos. Não invente números, períodos ou causas. Se os resultados não forem suficientes, diga isso explicitamente. Responda em português do Brasil.`;

export function buildFinancialAgentFallbackPrompt(
  question: string,
  traces: Array<{
    iteration: number;
    name: string;
    arguments: unknown;
    outcome: string;
    result: unknown;
  }>,
) {
  return `Pergunta original:\n${question}\n\nHistórico de ferramentas executadas/rejeitadas:\n${JSON.stringify(traces, null, 2)}\n\nProduza a melhor resposta possível usando somente esses resultados.`;
}
