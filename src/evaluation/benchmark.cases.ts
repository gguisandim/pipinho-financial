import type { BenchmarkCase } from "./benchmark.types.js";

export const benchmarkCases: BenchmarkCase[] = [
  {
    id: "cash-flow-general",
    description: "Consulta ampla deve usar o motor de fluxo sem inventar período.",
    question: "Analise meu fluxo financeiro",
    requiredTools: [{ name: "get_cash_flow", expectedArguments: {} }],
    answerMustContainAny: [
      ["fluxo"],
      ["2.845", "2845", "5.650", "5650", "2.804", "2804"],
    ],
    requireCausalGrounding: true,
  },
  {
    id: "no-data-july",
    description: "Mês sem dados deve gerar consulta temporal correta e recusa fundamentada.",
    question: "Quanto gastei em julho?",
    requiredTools: [
      {
        name: "get_cash_flow",
        expectedArguments: {
          startDate: "2026-07-01",
          endDate: "2026-07-31",
        },
      },
    ],
    answerMustContainAny: [
      ["não há", "não existem", "sem registros", "não existem transações"],
      ["julho", "agosto"],
    ],
    requireCausalGrounding: true,
  },
  {
    id: "missing-investments",
    description: "Dimensão inexistente deve ser confirmada via capabilities.",
    question: "Quanto tenho investido?",
    requiredTools: [{ name: "get_data_capabilities", expectedArguments: {} }],
    answerMustContainAny: [
      ["investimento", "investimentos"],
      ["não há", "não existem", "não disponível", "indisponível"],
    ],
    requireCausalGrounding: true,
  },
  {
    id: "institution-semantics",
    description: "Nubank/Itaú devem ser tratados como instituição, não categoria.",
    question: "Eu gastei mais no Nubank ou no Itaú?",
    requiredTools: [{ name: "get_data_capabilities", expectedArguments: {} }],
    answerMustContainAny: [
      ["instituição", "financial_institution"],
      ["não", "indisponível"],
    ],
    requireCausalGrounding: true,
  },
  {
    id: "largest-category-causal",
    description:
      "Maior categoria deve ser explicada quantitativamente sem inventar causas comportamentais.",
    question: "Qual foi minha maior categoria de gastos e por quê?",
    requiredTools: [{ name: "get_spending_by_category", expectedArguments: {} }],
    answerMustContainAny: [
      ["housing", "habitação"],
      ["1.400", "1400"],
    ],
    answerMustNotContain: [
      "custos de moradia costumam",
      "geralmente",
      "normalmente",
      "provavelmente",
    ],
    requireCausalGrounding: true,
  },
  {
    id: "category-composition",
    description:
      "Composição da categoria deve consultar transações observadas antes de citar detalhes.",
    question: "O que compõe meus gastos de habitação?",
    requiredTools: [
      {
        name: "get_category_transactions",
        expectedArguments: { category: "housing" },
      },
    ],
    answerMustContainAny: [
      ["aluguel"],
      ["1.400", "1400"],
    ],
    requireCausalGrounding: true,
  },
  {
    id: "largest-expense",
    description: "Maior gasto individual deve usar a tool de maiores despesas.",
    question: "Qual foi meu maior gasto individual?",
    requiredTools: [{ name: "get_largest_expenses" }],
    answerMustContainAny: [
      ["aluguel"],
      ["1.400", "1400"],
    ],
    requireCausalGrounding: true,
  },
];
