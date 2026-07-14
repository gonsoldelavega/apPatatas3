import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../../src/app.js";
import { bootstrapInitialAccount } from "../../src/auth/bootstrap.js";
import { AuthRepository } from "../../src/auth/repository.js";
import { AuthService } from "../../src/auth/service.js";
import { createDatabaseProbe, type Database } from "../../src/database/client.js";

const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET ?? "integration-test-jwt-secret-at-least-32-bytes";
let database: Database;
let server: Server;
let baseUrl: string;

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

async function jsonRequest(path: string, body?: unknown, accessToken?: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function login(email = "owner@example.test", password = "integration-password-2026"): Promise<TokenResponse> {
  const response = await jsonRequest("/auth/login", { email, password });
  assert.equal(response.status, 200);
  return (await response.json()) as TokenResponse;
}

before(async () => {
  assert.ok(databaseUrl, "DATABASE_URL es obligatoria para las pruebas de integración");
  database = createDatabaseProbe(databaseUrl);
  await database.pool.query("truncate table audit_events, users, companies cascade");
  await bootstrapInitialAccount(database.pool, {
    companyName: "Integration Company",
    email: "owner@example.test",
    displayName: "Integration Owner",
    password: "integration-password-2026",
  });
  const auth = await AuthService.create({
    repository: new AuthRepository(database.pool),
    jwtSecret,
    accessTokenTtlSeconds: 900,
    refreshTokenTtlDays: 30,
    loginRateLimitMax: 5,
    loginRateLimitWindowMs: 60_000,
  });
  server = createApp({ database, auth, version: "integration" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  if (database) {
    await database.pool.query("truncate table audit_events, users, companies cascade");
    await database.close();
  }
});

test("flujo completo de autenticación, rotación, reutilización y logout", async (context) => {
  let first!: TokenResponse;
  let rotated!: TokenResponse;

  await context.test("el esquema usa UUID y constraints multiempresa", async () => {
    const columns = await database.pool.query<{ table_name: string; column_name: string; data_type: string }>(
      `select table_name, column_name, data_type
       from information_schema.columns
       where table_schema = 'public'
         and (table_name, column_name) in (
           ('companies', 'id'),
           ('users', 'id'),
           ('memberships', 'company_id'),
           ('memberships', 'user_id'),
           ('auth_sessions', 'id'),
           ('auth_sessions', 'company_id'),
           ('audit_events', 'id')
         )`,
    );
    assert.equal(columns.rowCount, 7);
    assert.ok(columns.rows.every((column) => column.data_type === "uuid"));
    const constraints = await database.pool.query<{ constraint_name: string }>(
      `select constraint_name
       from information_schema.table_constraints
       where constraint_schema = 'public'
         and constraint_name in ('auth_sessions_membership_fk', 'invoices_company_contact_fk')`,
    );
    assert.equal(constraints.rowCount, 2);
  });

  await context.test("el bootstrap no puede ejecutarse una segunda vez", async () => {
    await assert.rejects(
      bootstrapInitialAccount(database.pool, {
        companyName: "Other Company",
        email: "other@example.test",
        displayName: "Other Owner",
        password: "another-integration-password",
      }),
      /Bootstrap rechazado/,
    );
  });

  await context.test("credenciales inválidas no revelan si el email existe", async () => {
    const unknown = await jsonRequest("/auth/login", { email: "unknown@example.test", password: "invalid-password-value" });
    const incorrect = await jsonRequest("/auth/login", { email: "owner@example.test", password: "invalid-password-value" });
    assert.equal(unknown.status, 401);
    assert.equal(incorrect.status, 401);
    assert.deepEqual(await unknown.json(), { error: "invalid_credentials" });
    assert.deepEqual(await incorrect.json(), { error: "invalid_credentials" });
  });

  await context.test("login correcto y GET /me", async () => {
    first = await login();
    assert.equal(first.tokenType, "Bearer");
    const me = await jsonRequest("/me", undefined, first.accessToken);
    assert.equal(me.status, 200);
    const profile = (await me.json()) as { email: string; company: { name: string }; membership: { role: string } };
    assert.equal(profile.email, "owner@example.test");
    assert.equal(profile.company.name, "Integration Company");
    assert.equal(profile.membership.role, "owner");
  });

  await context.test("refresh rota el token", async () => {
    const response = await jsonRequest("/auth/refresh", { refreshToken: first.refreshToken });
    assert.equal(response.status, 200);
    rotated = (await response.json()) as TokenResponse;
    assert.notEqual(rotated.refreshToken, first.refreshToken);
    const stored = await database.pool.query<{ refresh_token_hash: string }>(
      "select refresh_token_hash from auth_sessions order by created_at",
    );
    assert.ok(stored.rows.every((row) => /^[a-f0-9]{64}$/.test(row.refresh_token_hash)));
    assert.equal(JSON.stringify(stored.rows).includes("fp_rt_"), false);
  });

  await context.test("reutilizar un refresh revocado invalida toda la familia", async () => {
    const reuse = await jsonRequest("/auth/refresh", { refreshToken: first.refreshToken });
    assert.equal(reuse.status, 401);
    assert.deepEqual(await reuse.json(), { error: "invalid_refresh_token" });
    const activeAfterReuse = await jsonRequest("/auth/refresh", { refreshToken: rotated.refreshToken });
    assert.equal(activeAfterReuse.status, 401);
    const meAfterReuse = await jsonRequest("/me", undefined, rotated.accessToken);
    assert.equal(meAfterReuse.status, 401);
  });

  await context.test("logout revoca la sesión y bloquea /me y refresh", async () => {
    const tokens = await login();
    const logout = await jsonRequest("/auth/logout", { refreshToken: tokens.refreshToken }, tokens.accessToken);
    assert.equal(logout.status, 204);
    assert.equal((await jsonRequest("/me", undefined, tokens.accessToken)).status, 401);
    assert.equal((await jsonRequest("/auth/refresh", { refreshToken: tokens.refreshToken })).status, 401);
  });

  await context.test("rate limiting básico bloquea intentos repetidos", async () => {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const response = await jsonRequest("/auth/login", {
        email: "rate-limit@example.test",
        password: "invalid-password-value",
      });
      assert.equal(response.status, attempt <= 5 ? 401 : 429);
    }
  });

  await context.test("se registran eventos de auditoría sin tokens", async () => {
    const result = await database.pool.query<{ action: string; after_data: unknown }>(
      "select action, after_data from audit_events where action like 'auth.%' order by created_at",
    );
    const actions = result.rows.map((row) => row.action);
    for (const required of [
      "auth.login_succeeded",
      "auth.login_failed",
      "auth.refresh_succeeded",
      "auth.refresh_reuse_detected",
      "auth.logout_succeeded",
    ]) {
      assert.ok(actions.includes(required), `Falta auditoría ${required}`);
    }
    assert.equal(JSON.stringify(result.rows).includes("fp_rt_"), false);
    assert.equal(JSON.stringify(result.rows).includes("integration-password"), false);
  });
});
