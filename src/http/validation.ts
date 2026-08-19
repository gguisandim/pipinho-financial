import { z } from "zod";

function isRealIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine(isRealIsoDate, "Data inválida");

export const dateRangeShape = {
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
};

export function validateDateRange(
  value: { startDate?: string; endDate?: string },
  ctx: z.RefinementCtx,
): void {
  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    ctx.addIssue({
      code: "custom",
      path: ["endDate"],
      message: "endDate deve ser maior ou igual a startDate",
    });
  }
}
