import { describe, expect, it } from "vitest";
import { routeFinancialTools } from "../src/agent/financial-tool-router.js";

describe("financial tool router", () => {
  it("roteia poupança para a tool dedicada e não para capabilities", () => {
    const route = routeFinancialTools("Qual é minha taxa de poupança?");
    expect(route.intent).toBe("savings");
    expect(route.toolNames).toEqual(["get_savings_status"]);
    expect(route.toolNames).not.toContain("get_data_capabilities");
  });

  it("roteia quanto gastei para spending summary", () => {
    const route = routeFinancialTools("Quanto eu gastei em julho?");
    expect(route.intent).toBe("spending");
    expect(route.toolNames).toEqual(["get_spending_summary"]);
  });

  it("roteia evolução mensal para série mensal", () => {
    const route = routeFinancialTools("Como meus gastos evoluíram mês a mês?");
    expect(route.intent).toBe("monthly_trend");
    expect(route.toolNames).toEqual(["get_monthly_financial_trend"]);
  });

  it("roteia comparação entre dois meses para a série mensal", () => {
    const route = routeFinancialTools("Gastei mais em julho ou junho?");
    expect(route.intent).toBe("monthly_trend");
    expect(route.toolNames).toEqual(["get_monthly_financial_trend"]);
  });

  it("roteia gasto com alimentação para agregação por categoria", () => {
    const route = routeFinancialTools("Quanto gastei com alimentação em julho?");
    expect(route.intent).toBe("categories");
    expect(route.toolNames).toEqual(["get_spending_by_category"]);
  });

  it("roteia fluxo financeiro diretamente para cash flow", () => {
    const route = routeFinancialTools("Analise meu fluxo financeiro");
    expect(route.intent).toBe("cash_flow");
    expect(route.toolNames).toEqual(["get_cash_flow"]);
  });

  it("não expõe composição detalhada quando a pergunta pede apenas ranking de categorias", () => {
    const route = routeFinancialTools("Quais são minhas maiores categorias de gastos?");
    expect(route.intent).toBe("categories");
    expect(route.toolNames).toEqual(["get_spending_by_category"]);
  });

  it("reserva capabilities para dimensão não integrada", () => {
    const route = routeFinancialTools("Qual é meu saldo bancário atual?");
    expect(route.intent).toBe("capabilities");
    expect(route.toolNames).toEqual(["get_data_capabilities"]);
  });
});

describe("financial tool router - Cycle 11 natural language", () => {
  it("responde saudação sem forçar consulta financeira", () => {
    const route = routeFinancialTools("oi");
    expect(route.intent).toBe("conversation");
    expect(route.toolNames).toEqual([]);
  });

  it("roteia último gasto para transações recentes", () => {
    const route = routeFinancialTools("qual foi meu último gasto?");
    expect(route.intent).toBe("recent_transactions");
    expect(route.toolNames).toEqual(["get_recent_transactions"]);
  });

  it("roteia busca textual por Uber", () => {
    const route = routeFinancialTools("quanto foi aquele Uber de ontem?");
    expect(route.intent).toBe("transaction_search");
    expect(route.toolNames).toEqual(["search_transactions"]);
  });

  it("roteia média por dia para resumo diário", () => {
    const route = routeFinancialTools("quanto eu costumo gastar por dia?");
    expect(route.intent).toBe("daily_spending");
    expect(route.toolNames).toEqual(["get_daily_spending_summary"]);
  });

  it("trata quanto tenho como dimensão de saldo ainda não integrada", () => {
    const route = routeFinancialTools("quanto eu tenho agora?");
    expect(route.intent).toBe("capabilities");
  });
});
