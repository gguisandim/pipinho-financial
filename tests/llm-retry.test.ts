import { describe, expect, it, vi } from "vitest";
import { isTransientLlmError, withLlmRetry } from "../src/llm/providers/llm-retry.js";

describe("LLM retry", () => {
  it("reconhece connection error e 429 como transitórios", () => {
    expect(isTransientLlmError(new Error("Connection error."))).toBe(true);
    expect(isTransientLlmError({ status: 429, message: "rate limit" })).toBe(true);
    expect(isTransientLlmError({ status: 400, message: "tool_use_failed" })).toBe(false);
  });

  it("repete falha transitória e retorna o resultado", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(Object.assign(new Error("Connection error."), { status: 503 }))
      .mockResolvedValueOnce("ok");

    await expect(
      withLlmRetry(operation, { maxRetries: 1, baseDelayMs: 50 }),
    ).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("não repete erro de protocolo 400", async () => {
    const error = Object.assign(new Error("tool_use_failed"), { status: 400 });
    const operation = vi.fn<() => Promise<string>>().mockRejectedValue(error);

    await expect(
      withLlmRetry(operation, { maxRetries: 2, baseDelayMs: 50 }),
    ).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
