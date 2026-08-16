import type { AgentToolTrace } from "../../agent/financial-agent.types.js";
import type { CausalGroundingViolation } from "../../agent/causal-grounding.js";

export const FINANCIAL_GROUNDING_REPAIR_SYSTEM_PROMPT = `Você revisa respostas de um agente financeiro para remover afirmações causais ou detalhes não sustentados pelas ferramentas.

REGRAS:
- Preserve números e fatos que aparecem nos resultados das ferramentas.
- Não use conhecimento geral para explicar por que o usuário gastou dinheiro.
- Diferencie três níveis:
  1. explicação quantitativa: pode explicar que uma categoria é maior porque seu total supera os demais ou representa determinada proporção;
  2. composição observada: só cite descrições/transações que apareçam nos resultados das ferramentas;
  3. causa comportamental: só afirme se houver evidência explícita. Caso contrário, diga que a causa não pode ser determinada.
- Não use generalizações como "costuma", "geralmente", "provavelmente" ou "pode indicar".
- Retorne somente a resposta revisada, em português do Brasil.`;

export function buildFinancialGroundingRepairPrompt(options: {
  question: string;
  answer: string;
  violations: CausalGroundingViolation[];
  tools: AgentToolTrace[];
}) {
  return `Pergunta original:
${options.question}

Resposta que precisa de revisão:
${options.answer}

Violações detectadas deterministicamente:
${JSON.stringify(options.violations, null, 2)}

Evidências disponíveis nas ferramentas:
${JSON.stringify(
    options.tools.map(({ name, arguments: args, result }) => ({
      name,
      arguments: args,
      result,
    })),
    null,
    2,
  )}

Reescreva a resposta removendo somente as inferências não sustentadas e mantendo as informações financeiras verificáveis.`;
}
