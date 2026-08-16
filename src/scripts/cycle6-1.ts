import {
  createPluggyAuthClient,
  getPluggyConfigurationStatus,
} from "../integrations/pluggy/pluggy.factory.js";
import { PluggyAuthError } from "../integrations/pluggy/pluggy-auth.client.js";

console.log("=== CICLO 6.1: PLUGGY AUTHENTICATION ===");

const status = getPluggyConfigurationStatus();
console.log(`Base URL: ${status.baseUrl}`);
console.log(`Credenciais configuradas: ${status.configured ? "sim" : "não"}`);

if (!status.configured) {
  console.log(`Faltando: ${status.missing.join(", ")}`);
  console.log("\nConfigure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env.");
  console.log("As credenciais ficam somente no backend e nunca devem ser expostas ao frontend.");
  process.exitCode = 1;
} else {
  try {
    const client = createPluggyAuthClient();

    const first = await client.getApiKey();
    console.log("\n✓ POST /auth concluído com sucesso.");
    console.log("API Key recebida: sim (valor ocultado)");
    console.log(`Origem da chave: ${first.source}`);
    console.log(`Expiração estimada: ${first.expiresAt.toISOString()}`);

    const second = await client.getApiKey();
    console.log(`Cache em memória: ${second.source === "cache" ? "✓ funcionando" : "✗ não utilizado"}`);
    console.log(`Mesma sessão reutilizada: ${second.apiKey === first.apiKey ? "sim" : "não"}`);

    console.log("\nCiclo 6.1 concluído: autenticação server-side pronta.");
    console.log("Próximo passo (6.2): listar Items/Accounts e copiar Transactions para o nosso domínio.");
  } catch (error) {
    if (error instanceof PluggyAuthError) {
      console.error(`\n✗ Falha Pluggy: ${error.message}`);
      if (error.status) console.error(`HTTP: ${error.status}`);
      if (error.code) console.error(`Código local: ${error.code}`);
    } else {
      console.error(`\n✗ Falha inesperada: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exitCode = 1;
  }
}
