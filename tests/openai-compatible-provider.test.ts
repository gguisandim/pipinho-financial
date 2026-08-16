import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAiCompatibleToolCallingProvider } from "../src/llm/openai-compatible/openai-compatible.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAI-compatible provider", () => {
  it("normaliza tool calls vindas de um provider compatível", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "qwen3:8b",
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: {
                      name: "get_cash_flow",
                      arguments: { startDate: null, endDate: null },
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiCompatibleToolCallingProvider({
      provider: "openai-compatible-test",
      baseUrl: "https://example.test/api",
      model: "qwen3:8b",
    });

    const result = await provider.completeWithTools({
      messages: [{ role: "user", content: "Analise" }],
      tools: [],
    });

    expect(result.provider).toBe("openai-compatible-test");
    expect(result.model).toBe("qwen3:8b");
    expect(result.toolCalls[0]?.function.arguments).toBe(
      JSON.stringify({ startDate: null, endDate: null }),
    );
  });
});
