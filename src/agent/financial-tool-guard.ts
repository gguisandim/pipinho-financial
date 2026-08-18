import { ZodError } from "zod";
import { executeFinancialTool } from "../financial-tools/financial-tools.js";

export interface ToolExecutionOk {
  status: "executed";
  result: unknown;
}

export interface ToolExecutionRejected {
  status: "rejected";
  result: {
    status: "tool_error";
    code:
      | "invalid_json"
      | "ungrounded_date"
      | "year_mismatch"
      | "implicit_year_mismatch"
      | "invalid_arguments"
      | "execution_error";
    message: string;
    suggestion?: string;
    details?: unknown;
  };
}

export type SafeToolExecution = ToolExecutionOk | ToolExecutionRejected;

export type FinancialToolExecutor = (
  name: string,
  rawArguments: string,
) => unknown | Promise<unknown>;

const monthPattern =
  /\b(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i;

const temporalPattern =
  /\b(hoje|ontem|amanh[ãa]|semana|m[eê]s|meses|ano|anos|trimestre|semestre|per[ií]odo|desde|at[eé]|entre|[uú]ltim[oa]s?|pr[oó]xim[oa]s?)\b/i;

function parseArguments(rawArguments: string):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: ToolExecutionRejected } {
  try {
    const parsed = rawArguments.trim() ? JSON.parse(rawArguments) : {};

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false,
        error: {
          status: "rejected",
          result: {
            status: "tool_error",
            code: "invalid_json",
            message: "Os argumentos da ferramenta precisam ser um objeto JSON.",
          },
        },
      };
    }

    return { ok: true, value: parsed as Record<string, unknown> };
  } catch (error) {
    return {
      ok: false,
      error: {
        status: "rejected",
        result: {
          status: "tool_error",
          code: "invalid_json",
          message: "Os argumentos da ferramenta não são JSON válido.",
          details: error instanceof Error ? error.message : String(error),
        },
      },
    };
  }
}

function getDateArguments(args: Record<string, unknown>): string[] {
  return [args.startDate, args.endDate].filter(
    (value): value is string => typeof value === "string",
  );
}

function hasTemporalConstraint(question: string): boolean {
  return (
    temporalPattern.test(question) ||
    monthPattern.test(question) ||
    /\b20\d{2}\b/.test(question) ||
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(question)
  );
}

function explicitYears(question: string): Set<string> {
  return new Set([...question.matchAll(/\b(20\d{2})\b/g)].map((match) => match[1]));
}

function yearFromIsoDate(date: string): string | null {
  const match = /^(20\d{2})-\d{2}-\d{2}$/.exec(date);
  return match?.[1] ?? null;
}

function validateDateGrounding(
  question: string,
  args: Record<string, unknown>,
  referenceDate: string,
): ToolExecutionRejected | null {
  const dateArgs = getDateArguments(args);
  if (dateArgs.length === 0) return null;

  if (!hasTemporalConstraint(question)) {
    return {
      status: "rejected",
      result: {
        status: "tool_error",
        code: "ungrounded_date",
        message:
          "A pergunta do usuário não especificou período, mas a ferramenta recebeu datas. Essas datas não estão fundamentadas na pergunta.",
        suggestion:
          "Tente novamente omitindo startDate/endDate. Se precisar descobrir a cobertura temporal do dataset, use get_financial_period.",
        details: { receivedDates: dateArgs },
      },
    };
  }

  const years = explicitYears(question);
  if (years.size > 0) {
    const mismatched = dateArgs.filter((date) => {
      const year = yearFromIsoDate(date);
      return year !== null && !years.has(year);
    });

    if (mismatched.length > 0) {
      return {
        status: "rejected",
        result: {
          status: "tool_error",
          code: "year_mismatch",
          message:
            "O ano usado nos argumentos da ferramenta não corresponde ao ano explicitamente informado pelo usuário.",
          suggestion: "Use apenas anos mencionados na pergunta.",
          details: {
            explicitYears: [...years],
            receivedDates: dateArgs,
          },
        },
      };
    }
  } else if (monthPattern.test(question)) {
    const referenceYear = referenceDate.slice(0, 4);
    const mismatched = dateArgs.filter((date) => {
      const year = yearFromIsoDate(date);
      return year !== null && year !== referenceYear;
    });

    if (mismatched.length > 0) {
      return {
        status: "rejected",
        result: {
          status: "tool_error",
          code: "implicit_year_mismatch",
          message:
            "A pergunta menciona um mês sem ano; para este laboratório, o ano implícito é o ano da data de referência da aplicação.",
          suggestion: `Use ${referenceYear} ou consulte get_financial_period se a intenção for descobrir a cobertura dos dados.`,
          details: {
            referenceDate,
            receivedDates: dateArgs,
          },
        },
      };
    }
  }

  return null;
}

export function executeFinancialToolSafely(options: {
  question: string;
  name: string;
  rawArguments: string;
  referenceDate: string;
}): SafeToolExecution {
  const parsed = parseArguments(options.rawArguments);
  if (!parsed.ok) return parsed.error;

  const groundingError = validateDateGrounding(
    options.question,
    parsed.value,
    options.referenceDate,
  );
  if (groundingError) return groundingError;

  try {
    return {
      status: "executed",
      result: executeFinancialTool(options.name, options.rawArguments),
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        status: "rejected",
        result: {
          status: "tool_error",
          code: "invalid_arguments",
          message: "A ferramenta foi chamada com argumentos incompatíveis com seu contrato.",
          suggestion:
            "Corrija os argumentos usando exatamente o schema da ferramenta e tente novamente.",
          details: error.issues,
        },
      };
    }

    return {
      status: "rejected",
      result: {
        status: "tool_error",
        code: "execution_error",
        message: error instanceof Error ? error.message : "Falha desconhecida ao executar a ferramenta.",
      },
    };
  }
}


export async function executeFinancialToolSafelyAsync(options: {
  question: string;
  name: string;
  rawArguments: string;
  referenceDate: string;
  executor: FinancialToolExecutor;
}): Promise<SafeToolExecution> {
  const parsed = parseArguments(options.rawArguments);
  if (!parsed.ok) return parsed.error;

  const groundingError = validateDateGrounding(
    options.question,
    parsed.value,
    options.referenceDate,
  );
  if (groundingError) return groundingError;

  try {
    return {
      status: "executed",
      result: await options.executor(options.name, options.rawArguments),
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        status: "rejected",
        result: {
          status: "tool_error",
          code: "invalid_arguments",
          message: "A ferramenta foi chamada com argumentos incompatíveis com seu contrato.",
          suggestion:
            "Corrija os argumentos usando exatamente o schema da ferramenta e tente novamente.",
          details: error.issues,
        },
      };
    }

    return {
      status: "rejected",
      result: {
        status: "tool_error",
        code: "execution_error",
        message:
          error instanceof Error
            ? error.message
            : "Falha desconhecida ao executar a ferramenta.",
      },
    };
  }
}
