import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";
import type { AuthApplication } from "../src/auth/service.js";
import type { DatabaseProbe } from "../src/database/client.js";

const servers: Server[] = [];

const auth: AuthApplication = {
  login: async () => ({ accessToken: "access", refreshToken: "refresh", tokenType: "Bearer", expiresIn: 900 }),
  refresh: async () => ({ accessToken: "access", refreshToken: "refresh", tokenType: "Bearer", expiresIn: 900 }),
  authenticate: async () => ({
    userId: "user",
    companyId: "company",
    familyId: "family",
    email: "test@example.com",
    displayName: "Test",
    companyName: "Test Company",
    role: "owner",
  }),
  logout: async () => undefined,
  me: async () => ({
    id: "user",
    email: "test@example.com",
    displayName: "Test",
    company: { id: "company", name: "Test Company" },
    membership: { role: "owner" },
  }),
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function request(database: DatabaseProbe, path: string) {
  const server = createApp({
    database,
    auth,
    version: "test",
    now: () => new Date("2026-07-14T10:00:00.000Z"),
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return fetch(`http://127.0.0.1:${port}${path}`);
}

async function corsRequest(origin: string) {
  const server = createApp({ database: healthyDatabase, auth, version: "test", corsAllowedOrigins: ["http://127.0.0.1:4173"] });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return fetch(`http://127.0.0.1:${port}/contacts`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "GET" } });
}

const healthyDatabase: DatabaseProbe = {
  check: async () => undefined,
  close: async () => undefined,
};

test("GET /health informa de la API sin depender de PostgreSQL", async () => {
  const response = await request(healthyDatabase, "/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    service: "factupapa-next-api",
    version: "test",
    timestamp: "2026-07-14T10:00:00.000Z",
  });
});

test("GET /ready confirma la conexión con PostgreSQL", async () => {
  const response = await request(healthyDatabase, "/ready");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ready", database: "connected" });
});

test("GET /ready responde 503 cuando PostgreSQL no está disponible", async () => {
  const unavailableDatabase: DatabaseProbe = {
    check: async () => Promise.reject(new Error("database unavailable")),
    close: async () => undefined,
  };
  const response = await request(unavailableDatabase, "/ready");
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "not_ready", database: "unavailable" });
});

test("las rutas desconocidas responden 404", async () => {
  const response = await request(healthyDatabase, "/desconocida");
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not_found" });
});

test("CORS permite solo los orígenes configurados", async () => {
  const allowed = await corsRequest("http://127.0.0.1:4173");
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "http://127.0.0.1:4173");
  const blocked = await corsRequest("https://example.invalid");
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get("access-control-allow-origin"), null);
});
