import { createServer, type Server } from "node:http";
import type { DatabaseProbe } from "./database/client.js";

interface AppDependencies {
  database: DatabaseProbe;
  version: string;
  now?: () => Date;
}

function json(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

export function createApp({ database, version, now = () => new Date() }: AppDependencies): Server {
  return createServer(async (request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;

    if (request.method === "GET" && path === "/health") {
      json(response, 200, {
        status: "ok",
        service: "factupapa-next-api",
        version,
        timestamp: now().toISOString(),
      });
      return;
    }

    if (request.method === "GET" && path === "/ready") {
      try {
        await database.check();
        json(response, 200, { status: "ready", database: "connected" });
      } catch {
        json(response, 503, { status: "not_ready", database: "unavailable" });
      }
      return;
    }

    json(response, 404, { error: "not_found" });
  });
}
