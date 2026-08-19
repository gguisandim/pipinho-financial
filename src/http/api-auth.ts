import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";

export interface ApiAuthOptions {
  requireAuth?: boolean;
  authToken?: string | null;
}

function safeTokenEquals(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function registerApiAuthHook(
  app: FastifyInstance,
  options: ApiAuthOptions = {},
): void {
  const requireAuth = options.requireAuth ?? env.DASHBOARD_REQUIRE_AUTH === "true";
  const authToken =
    options.authToken === undefined ? env.DASHBOARD_API_TOKEN : options.authToken;

  app.addHook("onRequest", async (request, reply) => {
    if (!requireAuth) return;

    if (!authToken) {
      return reply.status(503).send({
        error: "api_auth_not_configured",
        message:
          "A API está protegida, mas DASHBOARD_API_TOKEN não foi configurado.",
      });
    }

    const header = request.headers.authorization;
    const prefix = "Bearer ";
    const received =
      typeof header === "string" && header.startsWith(prefix)
        ? header.slice(prefix.length)
        : "";

    if (!received || !safeTokenEquals(received, authToken)) {
      return reply.status(401).send({
        error: "unauthorized",
        message: "Bearer token ausente ou inválido.",
      });
    }
  });
}
