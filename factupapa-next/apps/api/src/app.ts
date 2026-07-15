import { createServer, type Server } from "node:http";
import { createAuthRoutes } from "./auth/routes.js";
import { AuthError, type AuthApplication } from "./auth/service.js";
import type { DatabaseProbe } from "./database/client.js";
import { HttpError } from "./http/errors.js";
import { json } from "./http/response.js";
import type { RouteHandler } from "./http/router.js";

interface AppDependencies {
  database: DatabaseProbe;
  auth: AuthApplication;
  version: string;
  routes?: RouteHandler[];
  now?: () => Date;
  corsAllowedOrigins?: string[];
  authCookie?: { name: string; secure: boolean; maxAgeSeconds: number };
}

export function createApp(dependencies: AppDependencies): Server {
  const handlers = [
    createAuthRoutes(
      dependencies.auth,
      dependencies.authCookie ?? {
        name: "factupapa_refresh",
        secure: false,
        maxAgeSeconds: 2_592_000,
      },
    ),
    ...(dependencies.routes ?? []),
  ];
  return createServer((request, response) => {
    void (async () => {
      response.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      );
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()",
      );
      response.setHeader("X-Frame-Options", "DENY");
      response.setHeader("Vary", "Origin");
      const origin = request.headers.origin;
      if (origin && dependencies.corsAllowedOrigins?.includes(origin)) {
        response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader(
          "Access-Control-Allow-Headers",
          "Authorization, Content-Type",
        );
        response.setHeader(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        );
        response.setHeader("Access-Control-Max-Age", "600");
        response.setHeader("Access-Control-Allow-Credentials", "true");
      }
      const url = new URL(request.url ?? "/", "http://localhost");
      if (
        request.method === "POST" &&
        url.pathname.startsWith("/auth/") &&
        (!origin || !dependencies.corsAllowedOrigins?.includes(origin))
      ) {
        json(response, 403, { error: "origin_not_allowed" });
        return;
      }
      if (request.method === "OPTIONS") {
        if (!origin || !dependencies.corsAllowedOrigins?.includes(origin)) {
          json(response, 403, { error: "origin_not_allowed" });
          return;
        }
        response.writeHead(204);
        response.end();
        return;
      }
      if (request.method === "GET" && url.pathname === "/health") {
        json(response, 200, {
          status: "ok",
          service: "factupapa-next-api",
          version: dependencies.version,
          timestamp: (dependencies.now ?? (() => new Date()))().toISOString(),
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/ready") {
        try {
          await dependencies.database.check();
          json(response, 200, { status: "ready", database: "connected" });
        } catch {
          json(response, 503, { status: "not_ready", database: "unavailable" });
        }
        return;
      }
      for (const handler of handlers) {
        if (await handler({ request, response, url })) return;
      }
      json(response, 404, { error: "not_found" });
    })().catch((error: unknown) => {
      if (error instanceof AuthError)
        json(response, error.status, { error: error.code });
      else if (error instanceof HttpError)
        json(response, error.status, { error: error.code });
      else json(response, 500, { error: "internal_error" });
    });
  });
}
