import type { EnrichmentCandidate } from "../../enrichment/enrichment-candidates.js";

export const TRANSACTION_ENRICHMENT_SYSTEM_PROMPT = `Você classifica descrições de despesas financeiras previamente minimizadas/redigidas pelo backend.

OBJETIVO:
Escolher uma categoria canônica somente quando a descrição sanitizada oferece evidência suficiente.

CATEGORIAS:
- housing: aluguel, condomínio, moradia e custos diretamente residenciais
- groceries: supermercado e compras de mercado
- food_delivery: plataformas de entrega de comida
- transport: transporte, aplicativo de corrida, combustível, estacionamento e pedágio
- utilities: energia, água, internet, telefonia e serviços essenciais recorrentes
- subscriptions: streaming, software e serviços digitais recorrentes
- health: farmácia, clínica, hospital, laboratório e saúde
- restaurants: restaurante, cafeteria, lanchonete e alimentação presencial
- education: escola, faculdade, cursos, livros e educação
- fitness: academia, esporte e fitness
- shopping: varejo, roupas, eletrônicos, marketplaces e compras gerais
- other: ambíguo ou sem evidência suficiente

REGRAS DE SEGURANÇA/QUALIDADE:
- Não tente identificar pessoa, conta, banco ou titular.
- Não use conhecimento sobre a vida do usuário.
- Não transforme PIX/transferência em categoria de consumo; esses candidatos já são filtrados pelo backend.
- Se o merchant não for reconhecível ou puder pertencer a várias categorias, use other.
- Use confidence=high apenas quando o texto indicar fortemente uma única categoria.
- Use confidence=medium quando houver boa evidência, mas não certeza total.
- Use confidence=low junto com category=other quando a evidência for fraca.
- Retorne exatamente uma sugestão para cada candidateId recebido, sem criar IDs novos.
- reason deve ser curto, objetivo e ter no máximo 12 palavras.`;

export function buildTransactionEnrichmentPrompt(candidates: EnrichmentCandidate[]) {
  return `Classifique os candidatos abaixo. Nenhum valor monetário, accountId, itemId ou data foi enviado.

${JSON.stringify(
    candidates.map((candidate) => ({
      candidateId: candidate.id,
      description: candidate.sanitizedDescription,
      occurrences: candidate.occurrenceCount,
      providerCategoryHints: candidate.providerCategories,
    })),
    null,
    2,
  )}`;
}
