import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../../src/app.js";
import { bootstrapInitialAccount } from "../../src/auth/bootstrap.js";
import { AuthRepository, type SessionIdentity } from "../../src/auth/repository.js";
import { AuthService } from "../../src/auth/service.js";
import { createDocumentLookup } from "../../src/authz/guard.js";
import { createContactPeopleRoutes } from "../../src/contact-people/routes.js";
import { ContactPeopleService } from "../../src/contact-people/service.js";
import { createDatabaseProbe, withTenantTransaction, type Database } from "../../src/database/client.js";

const databaseUrl = process.env.DATABASE_URL;
const adminUrl = process.env.DATABASE_ADMIN_URL;
let api: Database;
let admin: Database;
let server: Server;
let baseUrl = "";
let ownerToken = "";
let partnerToken = "";
let owner: SessionIdentity;
let customerId = "";

async function call(method: string, pathName: string, token?: string, body?: unknown): Promise<Response> {
  return fetch(`${baseUrl}${pathName}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json", origin: "http://integration.test" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const read = async <T = any>(response: Response): Promise<T> => (await response.json()) as T;

before(async () => {
  assert.ok(databaseUrl && adminUrl);
  admin = createDatabaseProbe(adminUrl);
  api = createDatabaseProbe(databaseUrl);
  await admin.pool.query("truncate table audit_events, users, companies cascade");
  await bootstrapInitialAccount(admin.pool, {
    companyName: "Empresa personas",
    email: "people-owner@example.test",
    displayName: "Titular",
    password: "people-integration-password",
  });
  const auth = await AuthService.create({
    repository: new AuthRepository(api.pool),
    jwtSecret: "people-integration-jwt-secret-at-least-32",
    accessTokenTtlSeconds: 900,
    refreshTokenTtlDays: 30,
    loginRateLimitMax: 50,
    loginRateLimitWindowMs: 60_000,
  });
  const row = await admin.pool.query<{ companyId: string; userId: string }>(
    `select m.company_id "companyId", m.user_id "userId" from memberships m join users u on u.id=m.user_id where u.email='people-owner@example.test'`,
  );
  owner = {
    ...row.rows[0]!,
    familyId: "00000000-0000-4000-8000-0000000000dd",
    email: "people-owner@example.test",
    displayName: "Titular",
    companyName: "Empresa personas",
    role: "owner",
  };
  customerId = await withTenantTransaction(api.pool, owner, async (client) => {
    const c = await client.query<{ id: string }>(
      `insert into contacts(company_id,kind,legal_name,tax_id,address) values($1,'customer','Bar Royal','TEST-PE-C','{}') returning id`,
      [owner.companyId],
    );
    return c.rows[0]!.id;
  });
  await admin.pool.query("select * from team_add_partner($1,$2,$3)", [owner.companyId, owner.userId, "people-socio@example.test"]);

  server = createApp({
    database: api,
    auth,
    version: "people-integration",
    corsAllowedOrigins: ["http://integration.test"],
    documents: createDocumentLookup(api.pool),
    routes: [createContactPeopleRoutes(auth, new ContactPeopleService(api.pool))],
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  ownerToken = (await auth.googleLogin("people-owner@example.test", "Titular")).accessToken;
  partnerToken = (await auth.googleLogin("people-socio@example.test", "Socio")).accessToken;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await api.pool.end();
  await admin.pool.end();
});

test("el maestro apunta personas de contacto con cargo y teléfono, las edita y las borra", async () => {
  const created = await call("POST", `/contacts/${customerId}/people`, ownerToken, { name: "Manolo", role: "Dueño", phone: "+34 600 11 22 33" });
  assert.equal(created.status, 201);
  const person = await read<{ id: string; name: string; role: string; phone: string }>(created);
  assert.equal(person.role, "Dueño");
  assert.equal((await call("POST", `/contacts/${customerId}/people`, ownerToken, { name: "Lucía", role: "Encargada", phone: "611223344" })).status, 201);
  const list = await read<{ items: Array<{ name: string }> }>(await call("GET", `/contacts/${customerId}/people`, ownerToken));
  assert.deepEqual(list.items.map((item) => item.name), ["Manolo", "Lucía"]);
  const patched = await call("PATCH", `/contacts/${customerId}/people/${person.id}`, ownerToken, { phone: "622 33 44 55" });
  assert.equal(patched.status, 200);
  assert.equal((await read<{ phone: string }>(patched)).phone, "622 33 44 55");
  assert.equal((await call("DELETE", `/contacts/${customerId}/people/${person.id}`, ownerToken)).status, 204);
  assert.equal((await read<{ items: unknown[] }>(await call("GET", `/contacts/${customerId}/people`, ownerToken))).items.length, 1);
});

test("datos inválidos dan 400 y un contacto inexistente 404", async () => {
  assert.equal((await call("POST", `/contacts/${customerId}/people`, ownerToken, { name: "" })).status, 400);
  assert.equal((await call("POST", `/contacts/${customerId}/people`, ownerToken, { name: "X", phone: "no es un teléfono" })).status, 400);
  assert.equal((await call("POST", `/contacts/${customerId}/people`, ownerToken, { name: "X", extra: 1 })).status, 400);
  assert.equal((await call("POST", "/contacts/3f2b8c1e-5d4a-4b7e-9c11-0a1b2c3d4e5f/people", ownerToken, { name: "X" })).status, 404);
});

test("el socio puede ver, apuntar, editar y borrar personas de contacto", async () => {
  const created = await call("POST", `/contacts/${customerId}/people`, partnerToken, { name: "Encargado nuevo", role: "Encargado", phone: "633 44 55 66" });
  assert.equal(created.status, 201);
  const person = await read<{ id: string }>(created);
  const list = await read<{ items: Array<{ id: string }> }>(await call("GET", `/contacts/${customerId}/people`, partnerToken));
  assert.ok(list.items.some((item) => item.id === person.id));
  assert.equal((await call("PATCH", `/contacts/${customerId}/people/${person.id}`, partnerToken, { phone: "644 55 66 77" })).status, 200);
  assert.equal((await call("DELETE", `/contacts/${customerId}/people/${person.id}`, partnerToken)).status, 204);
});
