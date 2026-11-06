import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../../src/app.js";
import { bootstrapInitialAccount } from "../../src/auth/bootstrap.js";
import { AuthRepository, type SessionIdentity } from "../../src/auth/repository.js";
import { AuthService } from "../../src/auth/service.js";
import { createDocumentLookup } from "../../src/authz/guard.js";
import { createCompanyRoutes } from "../../src/company/routes.js";
import { CompanyService } from "../../src/company/service.js";
import { createDatabaseProbe, withTenantTransaction, type Database } from "../../src/database/client.js";
import { DeliveryNoteService } from "../../src/delivery-notes/service.js";
import { createInvoiceRoutes } from "../../src/invoices/routes.js";
import { InvoiceService } from "../../src/invoices/service.js";

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
let productId = "";

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
    companyName: "Empresa con datos antiguos",
    email: "company-owner@example.test",
    displayName: "Titular",
    password: "company-integration-password",
  });
  // Dirección antigua guardada en la ficha (con un correo antiguo dentro, como podía estar).
  await admin.pool.query(
    `update companies set address = '{"street":"Calle Vieja 1","city":"Otro sitio","email":"viejo@example.test"}'::jsonb`,
  );
  const auth = await AuthService.create({
    repository: new AuthRepository(api.pool),
    jwtSecret: "company-integration-jwt-secret-at-least-32",
    accessTokenTtlSeconds: 900,
    refreshTokenTtlDays: 30,
    loginRateLimitMax: 50,
    loginRateLimitWindowMs: 60_000,
  });
  const row = await admin.pool.query<{ companyId: string; userId: string }>(
    `select m.company_id "companyId", m.user_id "userId" from memberships m join users u on u.id=m.user_id where u.email='company-owner@example.test'`,
  );
  owner = {
    ...row.rows[0]!,
    familyId: "00000000-0000-4000-8000-0000000000dd",
    email: "company-owner@example.test",
    displayName: "Titular",
    companyName: "Empresa con datos antiguos",
    role: "owner",
  };
  ({ customerId, productId } = await withTenantTransaction(api.pool, owner, async (client) => {
    const c = await client.query<{ id: string }>(
      `insert into contacts(company_id,kind,legal_name,tax_id,address) values($1,'customer','Cliente','TEST-CO-C','{}') returning id`,
      [owner.companyId],
    );
    const p = await client.query<{ id: string }>(
      `insert into products(company_id,name,sku,unit,sale_price,tax_rate) values($1,'Patata','TEST-CO-P','kg',1.45,4) returning id`,
      [owner.companyId],
    );
    return { customerId: c.rows[0]!.id, productId: p.rows[0]!.id };
  }));
  await admin.pool.query("select * from team_add_partner($1,$2,$3)", [owner.companyId, owner.userId, "co-socio@example.test"]);

  const invoices = new InvoiceService(api.pool);
  server = createApp({
    database: api,
    auth,
    version: "company-integration",
    corsAllowedOrigins: ["http://integration.test"],
    documents: createDocumentLookup(api.pool),
    routes: [createCompanyRoutes(auth, new CompanyService(api.pool)), createInvoiceRoutes(auth, invoices)],
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  ownerToken = (await auth.googleLogin("company-owner@example.test", "Titular")).accessToken;
  partnerToken = (await auth.googleLogin("co-socio@example.test", "Socio")).accessToken;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await api.pool.end();
  await admin.pool.end();
});

async function draftInvoice(date: string): Promise<{ id: string }> {
  const delivery = new DeliveryNoteService(api.pool);
  const note = await delivery.create(owner, { contactId: customerId, series: "A", issueDate: date });
  await delivery.addLine(owner, note!.id, { productId, quantity: "10" });
  await delivery.issue(owner, note!.id);
  const created = await call("POST", "/invoices/from-delivery-notes", ownerToken, { deliveryNoteIds: [note!.id], series: "F", issueDate: date });
  assert.equal(created.status, 201);
  const invoice = await read(created);
  return { id: invoice.id };
}

test("el maestro cambia correo, web y dirección; el socio no puede ni verlos", async () => {
  const before = await read(await call("GET", "/company/profile", ownerToken));
  assert.equal(before.email, null);
  assert.equal(before.address.street, "Calle Vieja 1");

  const saved = await call("PUT", "/company/profile", ownerToken, {
    email: "Contacto@OrigenPatatas.com",
    website: "origenpatatas.com",
    address: { street: "Calle Antoñete s/n", postalCode: "04741", city: "Cortijos de Marín" },
  });
  assert.equal(saved.status, 200);
  const profile = await read(saved);
  assert.equal(profile.email, "contacto@origenpatatas.com", "el correo se guarda en minúsculas");
  assert.equal(profile.website, "origenpatatas.com");
  assert.equal(profile.address.street, "Calle Antoñete s/n");
  assert.equal(profile.address.postalCode, "04741");
  assert.equal(profile.address.city, "Cortijos de Marín");
  assert.equal(profile.name, "Empresa con datos antiguos", "el nombre y el NIF no se tocan");

  assert.equal((await call("GET", "/company/profile", partnerToken)).status, 403);
  assert.equal((await call("PUT", "/company/profile", partnerToken, { email: "otro@example.test" })).status, 403);
  assert.equal((await call("GET", "/company/profile")).status, 401);
});

test("datos inválidos dan 400", async () => {
  for (const body of [
    { email: "no-es-un-correo" },
    { email: "a b@example.test" },
    { website: "con espacios.com" },
    { address: { street: "", postalCode: "04741", city: "X" } },
    { address: { street: "Calle", postalCode: "04741" } },
    { address: { street: "Calle", postalCode: "04741", city: "X", pais: "ES" } },
    { nombre: "otra cosa" },
    {},
  ]) {
    assert.equal((await call("PUT", "/company/profile", ownerToken, body)).status, 400, JSON.stringify(body));
  }
  // Se puede borrar el correo y la web.
  const cleared = await read(await call("PUT", "/company/profile", ownerToken, { email: null, website: "" }));
  assert.equal(cleared.email, null);
  assert.equal(cleared.website, null);
  await call("PUT", "/company/profile", ownerToken, { email: "contacto@origenpatatas.com", website: "origenpatatas.com" });
});

test("una factura ya emitida conserva su emisor; un borrador antiguo toma los datos nuevos al emitirse", async () => {
  // Factura emitida con la dirección antigua.
  await admin.pool.query(`update companies set address = '{"street":"Calle Vieja 1","city":"Otro sitio"}'::jsonb`);
  const oldInvoice = await draftInvoice("2026-11-02");
  const issuedOld = await call("POST", `/invoices/${oldInvoice.id}/issue`, ownerToken);
  assert.equal(issuedOld.status, 200);

  // Borrador creado con la dirección antigua…
  const draft = await draftInvoice("2026-11-03");
  // …y la empresa cambia de dirección antes de emitirlo.
  await call("PUT", "/company/profile", ownerToken, {
    address: { street: "Calle Antoñete s/n", postalCode: "04741", city: "Cortijos de Marín" },
  });
  assert.equal((await call("POST", `/invoices/${draft.id}/issue`, ownerToken)).status, 200);

  const keptOld = await read(await call("GET", `/invoices/${oldInvoice.id}`, ownerToken));
  assert.equal(keptOld.issuerAddress.street, "Calle Vieja 1", "la factura ya emitida no cambia");
  const fresh = await read(await call("GET", `/invoices/${draft.id}`, ownerToken));
  assert.equal(fresh.issuerAddress.street, "Calle Antoñete s/n");
  assert.equal(fresh.issuerAddress.postalCode, "04741");
  assert.equal(fresh.issuerAddress.city, "Cortijos de Marín");
  assert.equal(fresh.issuerAddress.email, undefined, "el correo antiguo ya no está en la dirección");
});

test("el PDF de una factura se genera con el correo y la web de la empresa", async () => {
  const invoices = await read(await call("GET", "/invoices?pageSize=10", ownerToken));
  const issued = invoices.items.find((item: { status: string }) => item.status === "issued");
  const response = await call("GET", `/invoices/${issued.id}/pdf`, ownerToken);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
  assert.ok(bytes.length > 1000);
});

test("la migración deja los datos actuales en la empresa con más facturas", async () => {
  const sql = await readFile(path.resolve(process.cwd(), "../../packages/database/0038_company_contact_details.sql"), "utf8");
  const update = sql.slice(sql.indexOf("update companies"));
  await admin.pool.query(`update companies set email = null, website = null, address = '{"street":"x"}'::jsonb`);
  await admin.pool.query(update);
  const row = (await admin.pool.query("select email, website, address from companies")).rows[0];
  assert.equal(row.email, "contacto@origenpatatas.com");
  assert.equal(row.website, "origenpatatas.com");
  assert.deepEqual(row.address, { street: "Calle Antoñete s/n", postalCode: "04741", city: "Cortijos de Marín" });
});
