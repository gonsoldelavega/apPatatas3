import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../../src/app.js";
import { bootstrapInitialAccount } from "../../src/auth/bootstrap.js";
import { hashPassword } from "../../src/auth/password.js";
import { AuthRepository } from "../../src/auth/repository.js";
import { AuthService } from "../../src/auth/service.js";
import { createDatabaseProbe, setTenantContext, withTenantTransaction, type Database, type TenantContext } from "../../src/database/client.js";

const databaseUrl = process.env.DATABASE_URL;
const databaseAdminUrl = process.env.DATABASE_ADMIN_URL;
const jwtSecret = process.env.JWT_SECRET ?? "integration-test-jwt-secret-at-least-32-bytes";
let apiDatabase: Database;
let adminDatabase: Database;
let server: Server;
let baseUrl: string;
let firstTenant: TenantContext;
let secondTenant: TenantContext;
let firstContactId: string;
let secondContactId: string;

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

async function createContact(context: TenantContext, name: string): Promise<string> {
  return withTenantTransaction(apiDatabase.pool, context, async (client) => {
    const result = await client.query<{ id: string }>(
      "insert into contacts(company_id, kind, legal_name) values ($1, 'customer', $2) returning id",
      [context.companyId, name],
    );
    return result.rows[0]!.id;
  });
}

before(async () => {
  assert.ok(databaseUrl, "DATABASE_URL del rol API es obligatoria para integración");
  assert.ok(databaseAdminUrl, "DATABASE_ADMIN_URL es obligatoria para preparar la integración");
  adminDatabase = createDatabaseProbe(databaseAdminUrl);
  apiDatabase = createDatabaseProbe(databaseUrl);
  await adminDatabase.pool.query("truncate table audit_events, users, companies cascade");
  await bootstrapInitialAccount(adminDatabase.pool, {
    companyName: "Integration Company A",
    email: "owner@example.test",
    displayName: "Integration Owner A",
    password: "integration-password-2026",
  });

  const secondPasswordHash = await hashPassword("second-integration-password-2026");
  const second = await adminDatabase.pool.query<{ company_id: string; user_id: string }>(
    `with company as (
       insert into companies(name) values ('Integration Company B') returning id
     ), user_account as (
       insert into users(email, display_name, password_hash)
       values ('owner-b@example.test', 'Integration Owner B', $1)
       returning id
     ), membership as (
       insert into memberships(company_id, user_id, role)
       select company.id, user_account.id, 'owner' from company cross join user_account
       returning company_id, user_id
     )
     select company_id, user_id from membership`,
    [secondPasswordHash],
  );
  const memberships = await adminDatabase.pool.query<{ company_id: string; user_id: string; email: string }>(
    `select membership.company_id, membership.user_id, user_account.email::text
     from memberships as membership join users as user_account on user_account.id = membership.user_id`,
  );
  const firstMembership = memberships.rows.find((row) => row.email === "owner@example.test");
  const secondMembership = memberships.rows.find((row) => row.email === "owner-b@example.test") ?? second.rows[0];
  assert.ok(firstMembership);
  assert.ok(secondMembership);
  firstTenant = { companyId: firstMembership.company_id, userId: firstMembership.user_id };
  secondTenant = { companyId: secondMembership.company_id, userId: secondMembership.user_id };

  firstContactId = await createContact(firstTenant, "Customer A");
  secondContactId = await createContact(secondTenant, "Customer B");

  const auth = await AuthService.create({
    repository: new AuthRepository(apiDatabase.pool),
    jwtSecret,
    accessTokenTtlSeconds: 900,
    refreshTokenTtlDays: 30,
    loginRateLimitMax: 5,
    loginRateLimitWindowMs: 60_000,
  });
  server = createApp({ database: apiDatabase, auth, version: "integration" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (adminDatabase) await adminDatabase.pool.query("truncate table audit_events, users, companies cascade");
  if (apiDatabase) await apiDatabase.close();
  if (adminDatabase) await adminDatabase.close();
});

test("RLS aísla estrictamente dos empresas y el contexto transaccional", async (context) => {
  await context.test("todas las tablas empresariales tienen RLS forzado y políticas", async () => {
    const protectedTables = [
      "companies", "users", "memberships", "contacts", "products", "invoices", "invoice_lines",
      "payments", "documents", "audit_events", "import_batches", "import_batch_rows", "auth_sessions", "contact_product_prices",
    ];
    const result = await adminDatabase.pool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relname, relrowsecurity, relforcerowsecurity
       from pg_class
       where relnamespace = 'public'::regnamespace and relname = any($1::text[])`,
      [protectedTables],
    );
    assert.equal(result.rowCount, protectedTables.length);
    assert.ok(result.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity));
    const policies = await adminDatabase.pool.query<{ tablename: string }>(
      "select distinct tablename from pg_policies where schemaname = 'public' and tablename = any($1::text[])",
      [protectedTables],
    );
    assert.equal(policies.rowCount, protectedTables.length);
  });

  await context.test("el rol API no es propietario, superusuario ni BYPASSRLS", async () => {
    const role = await apiDatabase.pool.query<{
      current_user: string; rolbypassrls: boolean; rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean;
    }>(
      `select current_user, rolbypassrls, rolsuper, rolcreatedb, rolcreaterole
       from pg_roles where rolname = current_user`,
    );
    assert.deepEqual(role.rows[0], {
      current_user: "factupapa_api",
      rolbypassrls: false,
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
    });
    const ownership = await adminDatabase.pool.query<{ owner: string }>(
      "select pg_get_userbyid(relowner) as owner from pg_class where oid = 'contacts'::regclass",
    );
    assert.equal(ownership.rows[0]?.owner, "factupapa_migrator");
    const migrator = await adminDatabase.pool.query<{ rolcanlogin: boolean; rolbypassrls: boolean }>(
      "select rolcanlogin, rolbypassrls from pg_roles where rolname = 'factupapa_migrator'",
    );
    assert.deepEqual(migrator.rows[0], { rolcanlogin: false, rolbypassrls: true });
    await assert.rejects(apiDatabase.pool.query("alter table contacts disable row level security"), /must be owner|permission denied/i);
  });

  await context.test("cada usuario solo lee su empresa", async () => {
    const own = await withTenantTransaction(apiDatabase.pool, firstTenant, (client) =>
      client.query<{ id: string }>("select id from contacts order by id"),
    );
    assert.deepEqual(own.rows.map((row) => row.id), [firstContactId]);
    assert.equal(own.rows.some((row) => row.id === secondContactId), false);
  });

  await context.test("WITH CHECK bloquea insert y cambio de company_id", async () => {
    await assert.rejects(
      withTenantTransaction(apiDatabase.pool, firstTenant, (client) =>
        client.query("insert into contacts(company_id, kind, legal_name) values ($1, 'customer', 'Cross tenant')", [secondTenant.companyId]),
      ),
      /row-level security policy/i,
    );
    await assert.rejects(
      withTenantTransaction(apiDatabase.pool, firstTenant, (client) =>
        client.query("update contacts set company_id = $1 where id = $2", [secondTenant.companyId, firstContactId]),
      ),
      /row-level security policy/i,
    );
  });

  await context.test("DELETE no puede afectar filas ajenas", async () => {
    const deleted = await withTenantTransaction(apiDatabase.pool, firstTenant, (client) =>
      client.query("delete from contacts where id = $1", [secondContactId]),
    );
    assert.equal(deleted.rowCount, 0);
    const stillExists = await adminDatabase.pool.query("select id from contacts where id = $1", [secondContactId]);
    assert.equal(stillExists.rowCount, 1);
  });

  await context.test("el pool no conserva contexto después de commit", async () => {
    const client = await apiDatabase.pool.connect();
    try {
      await client.query("begin");
      await setTenantContext(client, firstTenant);
      assert.equal((await client.query("select id from contacts")).rowCount, 1);
      await client.query("commit");
      assert.equal((await client.query("select id from contacts")).rowCount, 0);
    } finally {
      client.release();
    }
  });

  await context.test("rollback elimina el contexto antes de reutilizar conexión", async () => {
    const client = await apiDatabase.pool.connect();
    try {
      await client.query("begin");
      await setTenantContext(client, firstTenant);
      await client.query("select id from contacts");
      await assert.rejects(client.query("select definitely_missing_column from contacts"), /definitely_missing_column/i);
      await client.query("rollback");
      assert.equal((await client.query("select id from contacts")).rowCount, 0);
      await client.query("begin");
      await setTenantContext(client, secondTenant);
      const secondOwn = await client.query<{ id: string }>("select id from contacts");
      assert.deepEqual(secondOwn.rows.map((row) => row.id), [secondContactId]);
      await client.query("rollback");
    } finally {
      client.release();
    }
  });

  await context.test("memberships y auditoría están aisladas por empresa y usuario", async () => {
    const firstRows = await withTenantTransaction(apiDatabase.pool, firstTenant, async (client) => ({
      memberships: await client.query("select * from memberships"),
      audits: await client.query("select * from audit_events where company_id is not null"),
    }));
    assert.equal(firstRows.memberships.rowCount, 1);
    assert.ok(firstRows.audits.rows.every((row) => row.company_id === firstTenant.companyId));
  });
});

test("autenticación conserva login, rotación, reutilización, logout y /me", async (context) => {
  let first!: TokenResponse;
  let rotated!: TokenResponse;

  await context.test("el bootstrap no puede ejecutarse una segunda vez", async () => {
    await assert.rejects(
      bootstrapInitialAccount(adminDatabase.pool, {
        companyName: "Other Company", email: "other@example.test", displayName: "Other Owner",
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
    const me = await jsonRequest("/me", undefined, first.accessToken);
    assert.equal(me.status, 200);
    const profile = (await me.json()) as { email: string; company: { name: string }; membership: { role: string } };
    assert.equal(profile.email, "owner@example.test");
    assert.equal(profile.company.name, "Integration Company A");
    assert.equal(profile.membership.role, "owner");
  });

  await context.test("el segundo usuario inicia sesión en su propia empresa", async () => {
    const tokens = await login("owner-b@example.test", "second-integration-password-2026");
    const me = await jsonRequest("/me", undefined, tokens.accessToken);
    const profile = (await me.json()) as { company: { name: string } };
    assert.equal(profile.company.name, "Integration Company B");
  });

  await context.test("auth_sessions solo expone sesiones de la empresa y usuario actuales", async () => {
    const firstSessions = await withTenantTransaction(apiDatabase.pool, firstTenant, (client) =>
      client.query<{ company_id: string; user_id: string }>("select company_id, user_id from auth_sessions"),
    );
    const secondSessions = await withTenantTransaction(apiDatabase.pool, secondTenant, (client) =>
      client.query<{ company_id: string; user_id: string }>("select company_id, user_id from auth_sessions"),
    );
    assert.ok(firstSessions.rowCount && firstSessions.rowCount > 0);
    assert.ok(secondSessions.rowCount && secondSessions.rowCount > 0);
    assert.ok(firstSessions.rows.every((row) => row.company_id === firstTenant.companyId && row.user_id === firstTenant.userId));
    assert.ok(secondSessions.rows.every((row) => row.company_id === secondTenant.companyId && row.user_id === secondTenant.userId));
  });

  await context.test("refresh rota y PostgreSQL solo conserva hashes", async () => {
    const response = await jsonRequest("/auth/refresh", { refreshToken: first.refreshToken });
    assert.equal(response.status, 200);
    rotated = (await response.json()) as TokenResponse;
    assert.notEqual(rotated.refreshToken, first.refreshToken);
    const stored = await adminDatabase.pool.query<{ refresh_token_hash: string }>("select refresh_token_hash from auth_sessions");
    assert.ok(stored.rows.every((row) => /^[a-f0-9]{64}$/.test(row.refresh_token_hash)));
    assert.equal(JSON.stringify(stored.rows).includes("fp_rt_"), false);
  });

  await context.test("reutilizar un refresh revocado invalida toda la familia", async () => {
    assert.equal((await jsonRequest("/auth/refresh", { refreshToken: first.refreshToken })).status, 401);
    assert.equal((await jsonRequest("/auth/refresh", { refreshToken: rotated.refreshToken })).status, 401);
    assert.equal((await jsonRequest("/me", undefined, rotated.accessToken)).status, 401);
  });

  await context.test("logout revoca la sesión y bloquea /me y refresh", async () => {
    const tokens = await login();
    assert.equal((await jsonRequest("/auth/logout", { refreshToken: tokens.refreshToken }, tokens.accessToken)).status, 204);
    assert.equal((await jsonRequest("/me", undefined, tokens.accessToken)).status, 401);
    assert.equal((await jsonRequest("/auth/refresh", { refreshToken: tokens.refreshToken })).status, 401);
  });

  await context.test("rate limiting básico sigue activo", async () => {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const response = await jsonRequest("/auth/login", { email: "rate-limit@example.test", password: "invalid-password-value" });
      assert.equal(response.status, attempt <= 5 ? 401 : 429);
    }
  });

  await context.test("auditoría no contiene tokens ni contraseñas", async () => {
    const result = await adminDatabase.pool.query<{ action: string; after_data: unknown }>(
      "select action, after_data from audit_events where action like 'auth.%' order by created_at",
    );
    for (const action of ["auth.login_succeeded", "auth.login_failed", "auth.refresh_succeeded", "auth.refresh_reuse_detected", "auth.logout_succeeded"]) {
      assert.ok(result.rows.some((row) => row.action === action), `Falta auditoría ${action}`);
    }
    assert.equal(JSON.stringify(result.rows).includes("fp_rt_"), false);
    assert.equal(JSON.stringify(result.rows).includes("integration-password"), false);
  });
});
