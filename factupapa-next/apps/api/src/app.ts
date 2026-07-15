import { createServer, type Server } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createAuthRoutes } from "./auth/routes.js";
import { AuthError, type AuthApplication } from "./auth/service.js";
import type { DatabaseProbe } from "./database/client.js";
import { HttpError } from "./http/errors.js";
import { json } from "./http/response.js";
import type { RouteHandler } from "./http/router.js";
import type { Readiness } from "./health/readiness.js";
import { requestContext } from "./observability/context.js";
import { log, normalizePath } from "./observability/logger.js";
import { metrics } from "./observability/metrics.js";
import type { Pool } from "pg";
import { readJson } from "./http/request.js";

interface AppDependencies {
  database: DatabaseProbe;
  auth: AuthApplication;
  version: string;
  routes?: RouteHandler[];
  now?: () => Date;
  corsAllowedOrigins?: string[];
  authCookie?: { name: string; secure: boolean; maxAgeSeconds: number };
  readiness?: Readiness;
  metrics?: { token?: string; allowRemote: boolean; pool?: Pool };
}

function requestId(value: string | string[] | undefined): string {
  return typeof value === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(value) ? value : randomUUID();
}

function protectedMetrics(request: import("node:http").IncomingMessage, settings: NonNullable<AppDependencies["metrics"]>): boolean {
  const address = request.socket.remoteAddress ?? "";
  const local = address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
  if (local) return true;
  if (!settings.allowRemote) return false;
  const supplied = request.headers["x-operations-token"];
  if (!settings.token || typeof supplied !== "string") return false;
  const expected = Buffer.from(settings.token);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createApp(dependencies: AppDependencies): Server {
  const contextualAuth: AuthApplication = {
    login: (...args) => dependencies.auth.login(...args),
    refresh: (...args) => dependencies.auth.refresh(...args),
    logout: (...args) => dependencies.auth.logout(...args),
    me: (...args) => dependencies.auth.me(...args),
    authenticate: async (...args) => {
      const identity = await dependencies.auth.authenticate(...args);
      const context = requestContext.getStore();
      if (context) context.identity = identity;
      return identity;
    },
  };
  const handlers = [
    createAuthRoutes(
      contextualAuth,
      dependencies.authCookie ?? {
        name: "factupapa_refresh",
        secure: false,
        maxAgeSeconds: 2_592_000,
      },
    ),
    ...(dependencies.routes ?? []),
  ];
  return createServer((request, response) => {
    const id = requestId(request.headers["x-request-id"]);
    const started = performance.now();
    const contextData: import("./observability/context.js").RequestContext = { requestId: id };
    response.setHeader("X-Request-Id", id);
    response.once("finish", () => {
      const durationMs = Math.round((performance.now() - started) * 100) / 100;
      metrics.recordRequest(durationMs, contextData.errorCode);
      const normalizedPath = normalizePath(new URL(request.url ?? "/", "http://localhost").pathname);
      metrics.observe(normalizedPath, request.method, response.statusCode);
      log(response.statusCode >= 500 ? "error" : response.statusCode >= 400 ? "warn" : "info", {
        requestId: id, method: request.method, path: normalizedPath,
        status: response.statusCode, durationMs, userId: contextData.identity?.userId, companyId: contextData.identity?.companyId,
        errorCode: contextData.errorCode, serviceVersion: dependencies.version,
      });
    });
    requestContext.run(contextData, () => void (async () => {
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
          "Authorization, Content-Type, X-Request-Id",
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
        contextData.errorCode = "origin_not_allowed";
        json(response, 403, { error: "origin_not_allowed" });
        return;
      }
      if (request.method === "OPTIONS") {
        if (!origin || !dependencies.corsAllowedOrigins?.includes(origin)) {
          contextData.errorCode = "origin_not_allowed";
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
          if (dependencies.readiness) {
            const dependenciesState = await dependencies.readiness.check();
            const ready = Object.values(dependenciesState).every((value) => value === "ok");
            if (!ready) contextData.errorCode = "not_ready";
            json(response, ready ? 200 : 503, { status: ready ? "ready" : "not_ready", dependencies: dependenciesState });
          } else {
            await dependencies.database.check();
            json(response, 200, { status: "ready", database: "connected" });
          }
        } catch {
          contextData.errorCode = "not_ready";
          json(response, 503, { status: "not_ready", database: "unavailable" });
        }
        return;
      }
      if (request.method === "GET" && url.pathname === "/internal/metrics") {
        if (!dependencies.metrics || !protectedMetrics(request, dependencies.metrics)) {
          contextData.errorCode = "not_found";
          json(response, 404, { error: "not_found" });
          return;
        }
        json(response, 200, await metrics.snapshot(dependencies.metrics.pool));
        return;
      }
      if (request.method === "POST" && url.pathname === "/internal/metrics/operation") {
        if (!dependencies.metrics || !protectedMetrics(request, dependencies.metrics)) {
          contextData.errorCode = "not_found"; json(response, 404, { error: "not_found" }); return;
        }
        const body = await readJson(request, 1_024);
        if (Object.keys(body).some((key) => !["operation", "status", "amount"].includes(key))) throw new HttpError("invalid_request", 400);
        const amount = body.amount === undefined ? 1 : Number(body.amount);
        if (!Number.isInteger(amount) || amount < 1 || amount > 1_000_000) throw new HttpError("invalid_request", 400);
        if (body.operation === "backup" && body.status === "failed") metrics.increment("backupFailures", amount);
        else if (body.operation === "restore" && body.status === "failed") metrics.increment("restoreFailures", amount);
        else if (body.operation === "cleanup" && body.status === "completed") metrics.increment("cleanupRows", amount);
        else throw new HttpError("invalid_request", 400);
        response.writeHead(204); response.end(); return;
      }
      for (const handler of handlers) {
        if (await handler({ request, response, url })) return;
      }
      contextData.errorCode = "not_found";
      json(response, 404, { error: "not_found" });
    })().catch((error: unknown) => {
      const context = requestContext.getStore();
      if (error instanceof AuthError) {
        if (context) context.errorCode = error.code;
        json(response, error.status, { error: error.code });
      } else if (error instanceof HttpError) {
        if (context) context.errorCode = error.code;
        json(response, error.status, { error: error.code });
      } else {
        if (context) context.errorCode = "internal_error";
        json(response, 500, { error: "internal_error" });
      }
    }));
  });
}
