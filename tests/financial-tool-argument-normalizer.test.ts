import { describe, expect, it } from "vitest";
import { normalizeFinancialToolArguments } from "../src/agent/financial-tool-argument-normalizer.js";

const referenceDate = "2026-08-18";

describe("normalizeFinancialToolArguments", () => {
  it("preenche julho no ano de referência quando o provider omite datas", () => {
    const raw = normalizeFinancialToolArguments({
      question: "Quanto eu gastei em julho?",
      name: "get_spending_summary",
      rawArguments: "{}",
      referenceDate,
    });
    expect(JSON.parse(raw)).toEqual({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });
  });

  it("preenche o ano inteiro para ano explícito", () => {
    const raw = normalizeFinancialToolArguments({
      question: "Quanto eu gastei em 2023?",
      name: "get_spending_summary",
      rawArguments: "{}",
      referenceDate,
    });
    expect(JSON.parse(raw)).toEqual({
      startDate: "2023-01-01",
      endDate: "2023-12-31",
    });
  });

  it("transforma alimentação em categoryGroup=food", () => {
    const raw = normalizeFinancialToolArguments({
      question: "Quanto gastei com alimentação em julho?",
      name: "get_spending_by_category",
      rawArguments: '{"startDate":null,"endDate":null}',
      referenceDate,
    });
    expect(JSON.parse(raw)).toEqual({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      categoryGroup: "food",
    });
  });

  it("remove período integral derivado quando a pergunta não tem data", () => {
    const raw = normalizeFinancialToolArguments({
      question: "Analise meu fluxo financeiro",
      name: "get_cash_flow",
      rawArguments: '{"startDate":"2025-08-16","endDate":"2026-08-14"}',
      referenceDate,
      availablePeriod: { start: "2025-08-16", end: "2026-08-14" },
    });
    expect(JSON.parse(raw)).toEqual({});
  });

  it("canoniza o mês civil completo mesmo se o provider enviar intervalo parcial", () => {
    const raw = normalizeFinancialToolArguments({
      question: "Quanto eu gastei em julho?",
      name: "get_spending_summary",
      rawArguments: '{"startDate":"2026-07-02","endDate":"2026-07-30"}',
      referenceDate,
    });
    expect(JSON.parse(raw)).toEqual({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });
  });

  it("preserva intervalo específico quando o usuário delimita dias", () => {
    const raw = normalizeFinancialToolArguments({
      question: "Quanto eu gastei de 02/07 até 30/07?",
      name: "get_spending_summary",
      rawArguments: '{"startDate":"2026-07-02","endDate":"2026-07-30"}',
      referenceDate,
    });
    expect(JSON.parse(raw)).toEqual({
      startDate: "2026-07-02",
      endDate: "2026-07-30",
    });
  });
  it("canoniza comparação explícita entre junho e julho em uma única série", () => {
    const raw = normalizeFinancialToolArguments({
      question: "Gastei mais em julho ou junho?",
      name: "get_monthly_financial_trend",
      rawArguments:
        '{"startDate":"2026-06-01","endDate":"2026-08-18","months":3}',
      referenceDate,
    });

    expect(JSON.parse(raw)).toEqual({
      startDate: "2026-06-01",
      endDate: "2026-07-31",
      months: 2,
    });
  });

});

describe("normalizeFinancialToolArguments - linguagem temporal natural", () => {
  it("resolve ontem de forma determinística", () => {
    const raw = normalizeFinancialToolArguments({
      question: "Quanto eu gastei ontem?",
      name: "get_spending_summary",
      rawArguments: "{}",
      referenceDate,
    });
    expect(JSON.parse(raw)).toEqual({
      startDate: "2026-08-17",
      endDate: "2026-08-17",
    });
  });

  it("resolve este mês até a data de referência", () => {
    const raw = normalizeFinancialToolArguments({
      question: "Quanto eu gastei este mês?",
      name: "get_spending_summary",
      rawArguments: "{}",
      referenceDate,
    });
    expect(JSON.parse(raw)).toEqual({
      startDate: "2026-08-01",
      endDate: "2026-08-18",
    });
  });

  it("resolve mês passado como mês civil completo", () => {
    const raw = normalizeFinancialToolArguments({
      question: "E mês passado?",
      name: "get_spending_summary",
      rawArguments: "{}",
      referenceDate,
    });
    expect(JSON.parse(raw)).toEqual({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });
  });

  it("infere último gasto como uma única transação de spending", () => {
    const raw = normalizeFinancialToolArguments({
      question: "Qual foi meu último gasto?",
      name: "get_recent_transactions",
      rawArguments: "{}",
      referenceDate,
    });
    expect(JSON.parse(raw)).toEqual({ kind: "spending", limit: 1 });
  });
});


it("usa janela recente de 90 dias para baseline diária comparativa", () => {
  const raw = normalizeFinancialToolArguments({
    question: "Gastei muito ontem?",
    name: "get_daily_spending_summary",
    rawArguments: "{}",
    referenceDate,
  });
  expect(JSON.parse(raw)).toEqual({
    startDate: "2026-05-21",
    endDate: "2026-08-18",
  });
});

it("usa 90 dias para pergunta habitual sem período explícito", () => {
  const raw = normalizeFinancialToolArguments({
    question: "Quanto eu costumo gastar por dia?",
    name: "get_daily_spending_summary",
    rawArguments: "{}",
    referenceDate,
  });
  expect(JSON.parse(raw)).toEqual({
    startDate: "2026-05-21",
    endDate: "2026-08-18",
  });
});

it("resolve roxinho para Nubank em consulta de saldo", () => {
  const raw = normalizeFinancialToolArguments({
    question: "Quanto tem no roxinho?",
    name: "get_account_balances",
    rawArguments: "{}",
    referenceDate,
  });
  expect(JSON.parse(raw)).toEqual({ institution: "Nubank" });
});

it("resolve Pic Pay para PicPay em consulta por instituição", () => {
  const raw = normalizeFinancialToolArguments({
    question: "Quanto gastei no Pic Pay?",
    name: "get_spending_by_institution",
    rawArguments: "{}",
    referenceDate,
  });
  expect(JSON.parse(raw)).toEqual({ institution: "PicPay" });
});
