import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { AuthError, type AuthApplication } from "./auth/service.js";
import type { DatabaseProbe } from "./database/client.js";

interface AppDependencies {
  database: DatabaseProbe;
  auth: AuthApplication;
  version: string;
  now?: () => Date;
}

class RequestError extends Error {}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 16_384) throw new RequestError("request_too_large");
    chunks.push(buffer);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new RequestError("invalid_request");
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("invalid_json");
  }
}

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ") || authorization.length <= 7) {
    throw new AuthError("unauthorized", 401);
  }
  return authorization.slice(7);
}

function requireString(body: Record<string, unknown>, field: string, maximumLength: number): string {
  const value = body[field];
  if (typeof value !== "string" || value.length < 1 || value.length > maximumLength) {
    throw new RequestError("invalid_request");
  }
  return value;
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: AppDependencies,
): Promise<void> {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;

  if (request.method === "GET" && path === "/health") {
    json(response, 200, {
      status: "ok",
      service: "factupapa-next-api",
      version: dependencies.version,
      timestamp: (dependencies.now ?? (() => new Date()))().toISOString(),
    });
    return;
  }

  if (request.method === "GET" && path === "/ready") {
    try {
      await dependencies.database.check();
      json(response, 200, { status: "ready", database: "connected" });
    } catch {
      json(response, 503, { status: "not_ready", database: "unavailable" });
    }
    return;
  }

  if (request.method === "POST" && path === "/auth/login") {
    const body = await readJson(request);
    const tokens = await dependencies.auth.login(
      requireString(body, "email", 320),
      requireString(body, "password", 128),
      request.socket.remoteAddress ?? "unknown",
    );
    json(response, 200, tokens);
    return;
  }

  if (request.method === "POST" && path === "/auth/refresh") {
    const body = await readJson(request);
    const tokens = await dependencies.auth.refresh(requireString(body, "refreshToken", 256));
    json(response, 200, tokens);
    return;
  }

  if (request.method === "POST" && path === "/auth/logout") {
    const body = await readJson(request);
    await dependencies.auth.logout(bearerToken(request), requireString(body, "refreshToken", 256));
    response.writeHead(204, { "cache-control": "no-store" });
    response.end();
    return;
  }

  if (request.method === "GET" && path === "/me") {
    json(response, 200, await dependencies.auth.me(bearerToken(request)));
    return;
  }

  json(response, 404, { error: "not_found" });
}

export function createApp(dependencies: AppDependencies): Server {
  return createServer((request, response) => {
    void route(request, response, dependencies).catch((error: unknown) => {
      if (error instanceof AuthError) {
        json(response, error.status, { error: error.code });
      } else if (error instanceof RequestError) {
        json(response, 400, { error: error.message });
      } else {
        json(response, 500, { error: "internal_error" });
      }
    });
  });
}
