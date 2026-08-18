import type { AgentToolTrace } from "../../agent/financial-agent.types.js";
import type { FinancialQualityViolation } from "../../agent/financial-quality-grounding.js";

export const FINANCIAL_QUALITY_REPAIR_SYSTEM_PROMPT = `Você revisa uma resposta financeira para respeitar metadados de qualidade produzidos pelo backend.

REGRAS:
- Se savings.available=false, não publique valor de poupança nem savings rate. Diga que a métrica está indisponível e use o unavailableReason retornado pela ferramenta.
- Se income.quality=insufficient, não apresente entradas bancárias como renda total factual.
- Renda confirmada pode ser citada como confirmada; renda estimada deve ser explicitamente rotulada como estimada/baixa confiança.
- Não transforme bankInflows em income.
- Preserve spending e liquidez quando estiverem disponíveis.
- Preserve números somente quando os resultados das ferramentas sustentarem a afirmação.
- Retorne somente a resposta revisada em português do Brasil.`;

export function buildFinancialQualityRepairPrompt(options: {
  question: string;
  answer: string;
  violations: FinancialQualityViolation[];
  tools: AgentToolTrace[];
}) {
  return `Pergunta original:\n${options.question}\n\nResposta a revisar:\n${options.answer}\n\nViolações de qualidade detectadas:\n${JSON.stringify(options.violations, null, 2)}\n\nResultados disponíveis das ferramentas:\n${JSON.stringify(
    options.tools.map(({ name, arguments: args, result }) => ({
      name,
      arguments: args,
      result,
    })),
    null,
    2,
  )}\n\nReescreva a resposta usando estritamente os indicadores de disponibilidade e qualidade do backend.`;
}
