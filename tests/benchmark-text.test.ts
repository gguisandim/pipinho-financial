import { describe, expect, it } from "vitest";
import {
  containsBenchmarkConcept,
  containsExpectedNumber,
  extractBenchmarkNumbers,
} from "../src/evaluation/benchmark.text.js";

describe("benchmark textual evaluator", () => {
  it("normaliza valores financeiros PT-BR, espaços Unicode e formato EN", () => {
    expect(containsExpectedNumber({
      answer: "Fluxo líquido: R$ 2.845,64",
      expected: [2845.64],
    })).toBe(true);

    expect(containsExpectedNumber({
      answer: "Fluxo líquido: R$ 2\u202f845,64",
      expected: [2845.64],
    })).toBe(true);

    expect(containsExpectedNumber({
      answer: "Net cash flow: 2,845.64",
      expected: [2845.64],
    })).toBe(true);

    expect(extractBenchmarkNumbers("Taxa: 50,37%")).toContain(50.37);
  });

  it("entende ausência de dados sem depender de uma frase literal", () => {
    expect(
      containsBenchmarkConcept(
        "O conjunto atual não contém informações sobre investimentos.",
        "data_absence",
      ),
    ).toBe(true);

    expect(
      containsBenchmarkConcept(
        "Não foram encontrados registros para o mês solicitado.",
        "data_absence",
      ),
    ).toBe(true);
  });

  it("reconhece conceitos de domínio", () => {
    expect(containsBenchmarkConcept("Não temos dados de investimentos.", "investments")).toBe(true);
    expect(containsBenchmarkConcept("Falta a instituição financeira da transação.", "institution")).toBe(true);
    expect(containsBenchmarkConcept("Habitação foi a maior categoria.", "housing")).toBe(true);
    expect(containsBenchmarkConcept("A transação observada é Aluguel.", "rent")).toBe(true);
  });
});
