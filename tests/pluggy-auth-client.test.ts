import { describe, expect, it, vi } from "vitest";
import { PluggyAuthClient, PluggyAuthError } from "../src/integrations/pluggy/pluggy-auth.client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("PluggyAuthClient", () => {
  it("autentica uma vez e reutiliza a API key em memória", async () => {
    let nowMs = Date.parse("2026-08-16T17:00:00.000Z");
    const fetchMock = vi.fn(async () => jsonResponse({ apiKey: "pluggy-test-api-key" }));

    const client = new PluggyAuthClient({
      baseUrl: "https://api.pluggy.ai",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => nowMs,
      apiKeyTtlMs: 2 * 60 * 60 * 1000,
      refreshSkewMs: 5 * 60 * 1000,
    });

    const first = await client.getApiKey();
    expect(first.source).toBe("network");
    expect(first.apiKey).toBe("pluggy-test-api-key");

    nowMs += 60_000;
    const second = await client.getApiKey();
    expect(second.source).toBe("cache");
    expect(second.apiKey).toBe(first.apiKey);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(request?.method).toBe("POST");
    expect(JSON.parse(String(request?.body))).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
    });
  });

  it("renova a API key quando entra na janela de refresh", async () => {
    let nowMs = Date.parse("2026-08-16T17:00:00.000Z");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ apiKey: "key-1" }))
      .mockResolvedValueOnce(jsonResponse({ apiKey: "key-2" }));

    const client = new PluggyAuthClient({
      baseUrl: "https://api.pluggy.ai",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => nowMs,
      apiKeyTtlMs: 120_000,
      refreshSkewMs: 30_000,
    });

    expect((await client.getApiKey()).apiKey).toBe("key-1");
    nowMs += 95_000;
    expect((await client.getApiKey()).apiKey).toBe("key-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("transforma HTTP 401 em erro seguro sem vazar o secret", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ message: "invalid credentials" }, 401),
    );

    const client = new PluggyAuthClient({
      baseUrl: "https://api.pluggy.ai",
      clientId: "client-id",
      clientSecret: "super-secret-value",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(client.getApiKey()).rejects.toMatchObject({
      name: "PluggyAuthError",
      status: 401,
      code: "invalid_credentials",
    } satisfies Partial<PluggyAuthError>);

    try {
      await client.getApiKey();
    } catch (error) {
      expect(String(error)).not.toContain("super-secret-value");
    }
  });

  it("rejeita resposta 200 que não contém apiKey", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    const client = new PluggyAuthClient({
      baseUrl: "https://api.pluggy.ai",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(client.getApiKey()).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});
