import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { buildApp } from "../dist/app.js";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

const banned = [
  "dist/routes/ai.routes.js",
  "dist/routes/finance.routes.js",
  "dist/fixtures/synthetic-transactions.js",
  "dist/financial-tools/financial-tools.js",
  "dist/evaluation",
  "dist/scripts",
];

for (const path of banned) {
  try {
    await access(path, constants.F_OK);
    throw new Error(`Artefato de produção contém arquivo legado: ${path}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Artefato")) throw error;
  }
}

const fakeAgent = {
  async answer(question) {
    return {
      question,
      referenceDate: "2026-08-19",
      executionMode: "fast_path",
      answer: "ok",
      termination: "model_answer",
      iterations: 2,
      toolCalls: [],
      turns: [],
      grounding: {
        causal: { passed: true, repaired: false, violations: [] },
        quality: { passed: true, repaired: false, violations: [] },
        provenance: { passed: true, repaired: false, violations: [] },
        evidence: { passed: true, repaired: false, violations: [] },
      },
      llm: { total: { latencyMs: 0, usage: {} } },
    };
  },
};

const app = buildApp({
  logger: false,
  dashboard: { requireAuth: false },
  assistant: { requireAuth: false, agentService: fakeAgent },
});
await app.ready();

const health = await app.inject({ method: "GET", url: "/health" });
if (health.statusCode !== 200 || health.json().version !== packageJson.version) {
  throw new Error(`Healthcheck inválido: ${health.statusCode} ${health.body}`);
}

for (const legacy of ["/api/v1/finance/summary", "/api/v1/ai/agent-analysis"]) {
  const response = await app.inject({ method: "GET", url: legacy });
  if (response.statusCode !== 404) {
    throw new Error(`Rota legada ainda ativa: ${legacy} -> ${response.statusCode}`);
  }
}

const assistant = await app.inject({
  method: "POST",
  url: "/api/v1/assistant",
  payload: { question: "Quanto gastei em julho?" },
});
if (assistant.statusCode !== 200 || assistant.json().answer !== "ok") {
  throw new Error(`Assistant smoke inválido: ${assistant.statusCode} ${assistant.body}`);
}

await app.close();
console.log("Production smoke: OK");
