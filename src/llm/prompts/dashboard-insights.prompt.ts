import type { DashboardSignal } from "../../dashboard/dashboard.types.js";

export const DASHBOARD_INSIGHTS_SYSTEM_PROMPT = `Você é uma camada de priorização de insights para um dashboard financeiro pessoal.

Regras obrigatórias:
- O backend já calculou todos os números. Não recalcule métricas.
- Não invente valores, causas, hábitos, renda ou diagnósticos financeiros.
- Não escreva nenhum algarismo nos campos textuais. Os valores são renderizados pelo frontend a partir de metricRefs.
- Use apenas metricRefs fornecidos no snapshot.
- Se a qualidade de renda for insufficient, não trate renda estimada ou savings como confiáveis.
- "other" alto é limitação de classificação, não prova de comportamento do usuário.
- Priorize sinais objetivos que possam ser úteis no dashboard.
- uiAction deve ser uma ação fechada do schema; use-a para sugerir qual área do dashboard abrir, nunca invente rotas.
- Não mencione nomes internos de tools, Pluggy, prompts ou implementação.
- Produza no máximo o número de cards solicitado.
- Escreva em português brasileiro, com frases curtas e acionáveis.`;

export function buildDashboardInsightsPrompt(input: {
  maxCards: number;
  period: { start: string; end: string };
  metrics: unknown;
  quality: unknown;
  signals: DashboardSignal[];
  topCategories: unknown[];
  topInstitutions: unknown[];
}) {
  return JSON.stringify(
    {
      task: "Selecione e explique os pontos mais relevantes para o dashboard.",
      maxCards: input.maxCards,
      period: input.period,
      metrics: input.metrics,
      quality: input.quality,
      deterministicSignals: input.signals,
      topCategories: input.topCategories,
      topInstitutions: input.topInstitutions,
      outputRule:
        "Textos não podem conter algarismos. Referencie números somente por metricRefs.",
    },
    null,
    2,
  );
}
