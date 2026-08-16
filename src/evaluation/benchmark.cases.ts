import type { BenchmarkCase } from "./benchmark.types.js";

export const benchmarkCases: BenchmarkCase[] = [
  {
    id: "cash-flow-general",
    description: "Consulta ampla deve usar o motor de fluxo sem inventar período.",
    question: "Analise meu fluxo financeiro",
    requiredTools: [{ name: "get_cash_flow", expectedArguments: {} }],
    answerMustContainConcepts: ["cash_flow"],
    answerMustContainNumbers: [
      { anyOf: [2845.64, 5650, 2804.36], tolerance: 0.02 },
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
    answerMustContainConcepts: ["data_absence"],
    answerMustContainAny: [["julho", "agosto"]],
    requireCausalGrounding: true,
  },
  {
    id: "missing-investments",
    description: "Dimensão inexistente deve ser confirmada via capabilities.",
    question: "Quanto tenho investido?",
    requiredTools: [{ name: "get_data_capabilities", expectedArguments: {} }],
    answerMustContainConcepts: ["investments", "data_absence"],
    requireCausalGrounding: true,
  },
  {
    id: "institution-semantics",
    description: "Nubank/Itaú devem ser tratados como instituição, não categoria.",
    question: "Eu gastei mais no Nubank ou no Itaú?",
    requiredTools: [{ name: "get_data_capabilities", expectedArguments: {} }],
    answerMustContainConcepts: ["institution", "data_absence"],
    requireCausalGrounding: true,
  },
  {
    id: "largest-category-causal",
    description:
      "Maior categoria deve ser explicada quantitativamente sem inventar causas comportamentais.",
    question: "Qual foi minha maior categoria de gastos e por quê?",
    requiredTools: [{ name: "get_spending_by_category", expectedArguments: {} }],
    answerMustContainConcepts: ["housing"],
    answerMustContainNumbers: [{ anyOf: [1400], tolerance: 0.02 }],
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
    answerMustContainConcepts: ["rent"],
    answerMustContainNumbers: [{ anyOf: [1400], tolerance: 0.02 }],
    requireCausalGrounding: true,
  },
  {
    id: "largest-expense",
    description: "Maior gasto individual deve usar a tool de maiores despesas.",
    question: "Qual foi meu maior gasto individual?",
    requiredTools: [{ name: "get_largest_expenses" }],
    answerMustContainConcepts: ["rent"],
    answerMustContainNumbers: [{ anyOf: [1400], tolerance: 0.02 }],
    requireCausalGrounding: true,
  },
];
