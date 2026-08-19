import { buildApp } from "./app.js";
import { env } from "./config/env.js";

const app = buildApp();

async function shutdown(signal: string) {
  app.log.info({ signal }, "shutting down");
  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error(error, "graceful shutdown failed");
    process.exit(1);
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
