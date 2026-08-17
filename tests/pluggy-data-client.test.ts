import { describe, expect, it, vi } from "vitest";
import { PluggyApiClient } from "../src/integrations/pluggy/pluggy-api.client.js";
import type { PluggyAuthClient } from "../src/integrations/pluggy/pluggy-auth.client.js";
import { PluggyDataClient } from "../src/integrations/pluggy/pluggy-data.client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function fakeAuthClient() {
  return {
    getApiKey: vi.fn(async () => ({
      apiKey: "api-key",
      source: "cache" as const,
      createdAt: new Date("2026-08-16T20:00:00Z"),
      expiresAt: new Date("2026-08-16T22:00:00Z"),
    })),

    clearCache: vi.fn(),
  } as unknown as PluggyAuthClient;
}

describe("PluggyDataClient", () => {
  it("lista Accounts usando X-API-KEY", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        results: [
          {
            id: "account-1",
            itemId: "item-1",
            type: "BANK",
            subtype: "CHECKING_ACCOUNT",
            number: "1234-5",
            balance: 100,
            currencyCode: "BRL",
            name: "Conta",
          },
        ],
      }),
    );

    const api = new PluggyApiClient({
      baseUrl: "https://api.pluggy.ai",
      authClient: fakeAuthClient(),
      fetchImpl: fetchMock,
    });

    const client = new PluggyDataClient(api);

    const accounts = await client.fetchAccounts("item-1");

    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.type).toBe("BANK");

    const firstCall = fetchMock.mock.calls[0];

    expect(firstCall).toBeDefined();

    const [url, request] = firstCall!;

    expect(String(url)).toContain("/accounts?itemId=item-1");

    const headers = new Headers(request?.headers);

    expect(headers.get("X-API-KEY")).toBe("api-key");
  });

  it("pagina /v2/transactions seguindo o campo next", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              id: "tx-1",
              accountId: "account-1",
              description: "PIX 1",
              currencyCode: "BRL",
              amount: 10,
              date: "2026-08-01T00:00:00.000Z",
              status: "POSTED",
              type: "DEBIT",
            },
          ],
          next: "?accountId=account-1&after=cursor-2",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              id: "tx-2",
              accountId: "account-1",
              description: "PIX 2",
              currencyCode: "BRL",
              amount: 20,
              date: "2026-08-02T00:00:00.000Z",
              status: "POSTED",
              type: "CREDIT",
            },
          ],
          next: null,
        }),
      );

    const api = new PluggyApiClient({
      baseUrl: "https://api.pluggy.ai",
      authClient: fakeAuthClient(),
      fetchImpl: fetchMock,
    });

    const client = new PluggyDataClient(api);

    const result = await client.fetchAllTransactions("account-1", {
      dateFrom: "2026-08-01",
      maxPages: 10,
    });

    expect(result.transactions.map((tx) => tx.id)).toEqual([
      "tx-1",
      "tx-2",
    ]);

    expect(result.pages).toBe(2);
    expect(result.truncated).toBe(false);

    const firstCall = fetchMock.mock.calls[0];
    const secondCall = fetchMock.mock.calls[1];

    expect(firstCall).toBeDefined();
    expect(secondCall).toBeDefined();

    const [firstUrl] = firstCall!;
    const [secondUrl] = secondCall!;

    expect(String(firstUrl)).toContain(
      "/v2/transactions?accountId=account-1&dateFrom=2026-08-01",
    );

    expect(String(secondUrl)).toContain(
      "/v2/transactions?accountId=account-1&after=cursor-2",
    );
  });

  it("interrompe paginação no limite local", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        results: [
          {
            id: "tx-1",
            accountId: "account-1",
            description: "PIX",
            currencyCode: "BRL",
            amount: 10,
            date: "2026-08-01T00:00:00.000Z",
            status: "POSTED",
            type: "DEBIT",
          },
        ],
        next: "?accountId=account-1&after=next",
      }),
    );

    const api = new PluggyApiClient({
      baseUrl: "https://api.pluggy.ai",
      authClient: fakeAuthClient(),
      fetchImpl: fetchMock,
    });

    const client = new PluggyDataClient(api);

    const result = await client.fetchAllTransactions("account-1", {
      maxPages: 1,
    });

    expect(result.pages).toBe(1);
    expect(result.truncated).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});