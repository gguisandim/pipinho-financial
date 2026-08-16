import { checkProviderReadiness } from "../evaluation/providers/provider.factory.js";
import type { BenchmarkProviderId } from "../evaluation/benchmark.types.js";

const providers: BenchmarkProviderId[] = ["groq", "openrouter"];

console.log("=== PROVIDER READINESS ===");
for (const provider of providers) {
  const readiness = await checkProviderReadiness(provider);
  console.log(`${readiness.ready ? "✓" : "✗"} ${provider}: ${readiness.message}`);
  if (!readiness.ready && readiness.setupHint) {
    console.log(`  ${readiness.setupHint}`);
  }
}
