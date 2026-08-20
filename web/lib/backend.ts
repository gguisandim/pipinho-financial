function backendConfig() {
  const baseUrl = process.env.FINANCIAL_API_URL?.replace(/\/$/, "");
  const token = process.env.FINANCIAL_API_TOKEN;

  if (!baseUrl || !token) {
    throw new Error(
      "FINANCIAL_API_URL e FINANCIAL_API_TOKEN precisam estar configurados no servidor do Next.js.",
    );
  }

  return { baseUrl, token };
}

export async function financialApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { baseUrl, token } = backendConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  const payload = await response.json().catch(() => ({
    error: "invalid_backend_response",
  }));

  if (!response.ok) {
    const message =
      typeof payload?.message === "string"
        ? payload.message
        : `Backend financeiro respondeu HTTP ${response.status}.`;
    throw new Error(message);
  }

  return payload as T;
}
