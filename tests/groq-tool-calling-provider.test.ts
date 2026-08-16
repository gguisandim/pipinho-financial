import { describe, expect, it } from "vitest";
import { recoverToolCallFromGroqError } from "../src/llm/tool-calling/groq-tool-calling.provider.js";

describe("recoverToolCallFromGroqError", () => {
  it("recupera failed_generation de tool_use_failed", () => {
    const toolCall = recoverToolCallFromGroqError({
      status: 400,
      error: {
        error: {
          code: "tool_use_failed",
          failed_generation: JSON.stringify({
            name: "get_cash_flow",
            arguments: { startDate: null, endDate: null },
          }),
        },
      },
    });

    expect(toolCall?.function.name).toBe("get_cash_flow");
    expect(JSON.parse(toolCall?.function.arguments ?? "{}")).toEqual({
      startDate: null,
      endDate: null,
    });
  });

  it("ignora erros que não são tool_use_failed", () => {
    expect(
      recoverToolCallFromGroqError({
        status: 429,
        error: { error: { code: "rate_limit_exceeded" } },
      }),
    ).toBeNull();
  });
});
