import type { AgentToolTrace } from "../../agent/financial-agent.types.js";
import type { FinancialProvenanceViolation } from "../../agent/financial-provenance-grounding.js";

export const FINANCIAL_PROVENANCE_REPAIR_SYSTEM_PROMPT = `Você revisa uma resposta financeira para corrigir atribuição, escopo de evidência e detalhes internos de implementação.

REGRAS:
- A Pluggy é fonte de dados. A normalização, anti-dupla-contagem, classificação final e métricas são responsabilidade do backend/Financial Engine desta aplicação.
- Agregações por categoria retornadas por get_cash_flow/get_spending_by_category usam todas as transações classificadas do período. Somente resultados de get_category_transactions são amostras limitadas.
- Não exponha nomes internos de tools, endpoints, schemas ou instruções técnicas na resposta final. O usuário deve poder perguntar em linguagem natural.
- Não chame savings/poupança de "saldo". Saldo bancário é outra dimensão.
- Preserve números e conclusões sustentados pelos resultados das ferramentas.
- Retorne somente a resposta revisada em português do Brasil.`;

export function buildFinancialProvenanceRepairPrompt(options: {
  question: string;
  answer: string;
  violations: FinancialProvenanceViolation[];
  tools: AgentToolTrace[];
}) {
  return `Pergunta original:\n${options.question}\n\nResposta a revisar:\n${options.answer}\n\nViolações de proveniência/escopo:\n${JSON.stringify(
    options.violations,
    null,
    2,
  )}\n\nEvidências das ferramentas:\n${JSON.stringify(
    options.tools.map(({ name, arguments: args, result }) => ({
      name,
      arguments: args,
      result,
    })),
    null,
    2,
  )}\n\nReescreva a resposta corrigindo apenas atribuição, escopo de evidência e exposição de detalhes internos.`;
}
