import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../../src/app.js";
import { bootstrapInitialAccount } from "../../src/auth/bootstrap.js";
import { AuthRepository, type SessionIdentity } from "../../src/auth/repository.js";
import { AuthService } from "../../src/auth/service.js";
import { createDocumentLookup } from "../../src/authz/guard.js";
import { ContactService } from "../../src/contacts/service.js";
import { createContactRoutes } from "../../src/contacts/routes.js";
import { createDatabaseProbe, withTenantTransaction, type Database } from "../../src/database/client.js";
import { DeliveryNoteService } from "../../src/delivery-notes/service.js";
import { createDeliveryNoteRoutes } from "../../src/delivery-notes/routes.js";
import { createFinanceRoutes } from "../../src/finance/routes.js";
import { FinanceService } from "../../src/finance/service.js";
import { InvoiceService } from "../../src/invoices/service.js";
import { createInvoiceRoutes } from "../../src/invoices/routes.js";
import { ProductService } from "../../src/products/service.js";
import { createProductRoutes } from "../../src/products/routes.js";
import { createTeamRoutes } from "../../src/team/routes.js";
import { TeamService } from "../../src/team/service.js";

const databaseUrl = process.env.DATABASE_URL;
const adminUrl = process.env.DATABASE_ADMIN_URL;
const MASTER = "master@example.test";
const PARTNERS = ["socio1@example.test", "socio2@example.test", "socio3@example.test"];

let api: Database;
let admin: Database;
let server: Server;
let baseUrl: string;
let auth: AuthService;
let master: SessionIdentity;
let masterToken: string;
let customerId: string;
let productId: string;
let oldInvoiceId: string;
let newInvoiceId: string;
let oldNoteId: string;
let newNoteId: string;
let partnerAccessIds: string[] = [];

async function call(method: string, path: string, token?: string, body?: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json", origin: "http://integration.test" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function json<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

before(async () => {
  assert.ok(databaseUrl && adminUrl, "DATABASE_URL y DATABASE_ADMIN_URL son obligatorias");
  admin = createDatabaseProbe(adminUrl);
  api = createDatabaseProbe(databaseUrl);
  await admin.pool.query("truncate table audit_events, users, companies cascade");
  await bootstrapInitialAccount(admin.pool, {
    companyName: "Empresa del maestro",
    email: MASTER,
    displayName: "Maestro",
    password: "master-integration-password-1",
  });
  auth = await AuthService.create({
    repository: new AuthRepository(api.pool),
    jwtSecret: "team-integration-jwt-secret-at-least-32-bytes",
    accessTokenTtlSeconds: 900,
    refreshTokenTtlDays: 30,
    loginRateLimitMax: 50,
    loginRateLimitWindowMs: 60_000,
  });
  const row = await admin.pool.query<{ companyId: string; userId: string }>(
    `select m.company_id "companyId", m.user_id "userId" from memberships m join users u on u.id = m.user_id where u.email = $1`,
    [MASTER],
  );
  master = {
    ...row.rows[0]!,
    familyId: "00000000-0000-4000-8000-0000000000aa",
    email: MASTER,
    displayName: "Maestro",
    companyName: "Empresa del maestro",
    role: "owner",
  };

  // Datos de prueba: un cliente, un producto, facturas y albaranes de octubre (antiguos) y noviembre (visibles).
  ({ customerId, productId } = await withTenantTransaction(api.pool, master, async (client) => {
    const c = await client.query<{ id: string }>(
      `insert into contacts(company_id,kind,legal_name,tax_id,address) values($1,'customer','Cliente Ficticio','TEST-TEAM-C','{"city":"Ficticia"}') returning id`,
      [master.companyId],
    );
    const p = await client.query<{ id: string }>(
      `insert into products(company_id,name,sku,unit,sale_price,tax_rate) values($1,'Patata ficticia','TEST-TEAM-P','kg',1.45,4) returning id`,
      [master.companyId],
    );
    return { customerId: c.rows[0]!.id, productId: p.rows[0]!.id };
  }));
  const delivery = new DeliveryNoteService(api.pool);
  const invoices = new InvoiceService(api.pool);
  async function note(issueDate: string): Promise<string> {
    const created = await delivery.create(master, { contactId: customerId, series: "A", issueDate });
    await delivery.addLine(master, created!.id, { productId, quantity: "10" });
    return (await delivery.issue(master, created!.id))!.id;
  }
  oldNoteId = await note("2026-10-10");
  newNoteId = await note("2026-11-10");
  const oldInvoice = await invoices.fromDeliveryNotes(master, { deliveryNoteIds: [await note("2026-10-12")], series: "F", issueDate: "2026-10-15" });
  oldInvoiceId = (await invoices.issue(master, oldInvoice!.id))!.id;
  const newInvoice = await invoices.fromDeliveryNotes(master, { deliveryNoteIds: [await note("2026-11-12")], series: "F", issueDate: "2026-11-15" });
  newInvoiceId = (await invoices.issue(master, newInvoice!.id))!.id;

  server = createApp({
    database: api,
    auth,
    version: "team-integration",
    corsAllowedOrigins: ["http://integration.test"],
    documents: createDocumentLookup(api.pool),
    partnerHistoryFrom: "2026-11-01",
    now: () => new Date("2026-11-20T10:00:00Z"),
    routes: [
      createTeamRoutes(auth, new TeamService(api.pool)),
      createInvoiceRoutes(auth, invoices),
      createDeliveryNoteRoutes(auth, delivery),
      createFinanceRoutes(auth, new FinanceService(api.pool)),
      createContactRoutes(auth, new ContactService(api.pool)),
      createProductRoutes(auth, new ProductService(api.pool)),
    ],
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  masterToken = (await auth.googleLogin(MASTER, "Maestro")).accessToken;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await api.pool.end();
  await admin.pool.end();
});

test("una cuenta de Google nueva y no autorizada se rechaza y NO crea empresa", async () => {
  const before = await admin.pool.query("select count(*)::int n from companies");
  await assert.rejects(
    () => auth.googleLogin("intruso@example.test", "Intruso"),
    (error: unknown) => (error as { code?: string }).code === "google_account_not_authorized",
  );
  const after = await admin.pool.query("select count(*)::int n from companies");
  assert.equal(after.rows[0].n, before.rows[0].n);
  const users = await admin.pool.query("select count(*)::int n from users where email = 'intruso@example.test'");
  assert.equal(users.rows[0].n, 0);
});

test("el maestro sigue entrando con Google y conserva el rol owner", async () => {
  const me = await json<{ membership: { role: string } }>(await call("GET", "/me", masterToken));
  assert.equal(me.membership.role, "owner");
});

test("solo el maestro gestiona socios; máximo 3; sin duplicados", async () => {
  for (const email of PARTNERS) {
    const response = await call("POST", "/team/members", masterToken, { email: email.toUpperCase() });
    assert.equal(response.status, 201, email);
    partnerAccessIds.push((await json<{ id: string }>(response)).id);
  }
  assert.equal((await call("POST", "/team/members", masterToken, { email: "cuarto@example.test" })).status, 409);
  assert.equal((await call("POST", "/team/members", masterToken, { email: PARTNERS[0]! })).status, 409);
  assert.equal((await call("POST", "/team/members", masterToken, { email: MASTER })).status, 409);
  assert.equal((await call("POST", "/team/members", masterToken, { email: "no-es-un-correo" })).status, 400);
  const list = await json<{ items: Array<{ email: string; registered: boolean }>; limit: number }>(
    await call("GET", "/team/members", masterToken),
  );
  assert.equal(list.items.length, 3);
  assert.equal(list.limit, 3);
  assert.ok(list.items.every((item) => item.registered === false));
  assert.ok(list.items.every((item) => PARTNERS.includes(item.email)));
});

let partnerToken = "";

test("un socio autorizado entra en la empresa del maestro con rol partner", async () => {
  partnerToken = (await auth.googleLogin(PARTNERS[0]!, "Socio Uno")).accessToken;
  const me = await json<{ membership: { role: string }; company: { id: string } }>(
    await call("GET", "/me", partnerToken),
  );
  assert.equal(me.membership.role, "partner");
  assert.equal(me.company.id, master.companyId);
  const companies = await admin.pool.query("select count(*)::int n from companies");
  assert.equal(companies.rows[0].n, 1, "el socio no crea una empresa propia");
});

test("el socio NO puede gestionar el equipo ni ver compras, gastos, stock, importaciones o integraciones", async () => {
  for (const [method, path] of [
    ["GET", "/team/members"],
    ["GET", "/purchases"],
    ["GET", "/recurring-expenses"],
    ["GET", "/stock"],
    ["GET", "/imports"],
    ["GET", "/integrations/gmail"],
  ] as const) {
    assert.equal((await call(method, path, partnerToken)).status, 403, `${method} ${path}`);
  }
  assert.equal((await call("POST", "/team/members", partnerToken, { email: "otro@example.test" })).status, 403);
});

test("el socio NO puede editar clientes ni productos (solo leerlos)", async () => {
  assert.equal((await call("GET", "/contacts", partnerToken)).status, 200);
  assert.equal((await call("GET", "/products", partnerToken)).status, 200);
  assert.equal((await call("POST", "/contacts", partnerToken, { type: "customer", legalName: "Nuevo", taxId: "X" })).status, 403);
  assert.equal((await call("PATCH", `/contacts/${customerId}`, partnerToken, { legalName: "Cambiado" })).status, 403);
  assert.equal((await call("PATCH", `/products/${productId}`, partnerToken, { salePrice: "99" })).status, 403);
  assert.equal((await call("DELETE", `/products/${productId}`, partnerToken)).status, 403);
});

test("el socio solo ve facturas y albaranes desde el 1 de noviembre", async () => {
  const invoices = await json<{ items: Array<{ id: string; issueDate: string }> }>(await call("GET", "/invoices?pageSize=100", partnerToken));
  assert.ok(invoices.items.length >= 1);
  assert.ok(invoices.items.every((item) => item.issueDate >= "2026-11-01"));
  assert.ok(invoices.items.some((item) => item.id === newInvoiceId));
  assert.ok(!invoices.items.some((item) => item.id === oldInvoiceId));
  // Intentar saltarse el recorte
  for (const query of ["from=2020-01-01", "from=2026-9-1", "from=2026-10-01&to=2026-10-31", "from=abc"]) {
    const response = await call("GET", `/invoices?${query}&pageSize=100`, partnerToken);
    if (response.status === 200) {
      const body = await json<{ items: Array<{ issueDate: string }> }>(response);
      assert.ok(body.items.every((item) => item.issueDate >= "2026-11-01"), query);
    }
  }
  assert.equal((await call("GET", `/invoices/${oldInvoiceId}`, partnerToken)).status, 404);
  assert.equal((await call("GET", `/invoices/${oldInvoiceId}/pdf`, partnerToken)).status, 404);
  assert.equal((await call("GET", `/invoices/${newInvoiceId}`, partnerToken)).status, 200);

  const notes = await json<{ items: Array<{ id: string; issueDate: string }> }>(await call("GET", "/delivery-notes?pageSize=100", partnerToken));
  assert.ok(notes.items.every((item) => item.issueDate >= "2026-11-01"));
  assert.ok(notes.items.some((item) => item.id === newNoteId));
  assert.ok(!notes.items.some((item) => item.id === oldNoteId));
  assert.equal((await call("GET", `/delivery-notes/${oldNoteId}`, partnerToken)).status, 404);
  assert.equal((await call("GET", `/delivery-notes/${newNoteId}`, partnerToken)).status, 200);
});

test("el resumen del socio no incluye octubre ni pendientes anteriores", async () => {
  const masterSummary = await json<{ sales: string; receivables: string }>(
    await call("GET", "/finance/summary?from=2026-10-01&to=2026-11-30", masterToken),
  );
  const partnerSummary = await json<{ sales: string; receivables: string }>(
    await call("GET", "/finance/summary?from=2026-10-01&to=2026-11-30", partnerToken),
  );
  assert.ok(Number(masterSummary.sales) > Number(partnerSummary.sales), "el maestro ve octubre, el socio no");
  assert.ok(Number(masterSummary.receivables) > Number(partnerSummary.receivables), "pendiente de cobro: solo desde noviembre");
  assert.equal((await call("GET", "/finance/summary?from=2026-10-01&to=2026-10-31", partnerToken)).status, 403);
  const monthly = await json<Array<{ month: string }>>(await call("GET", "/finance/monthly?months=24", partnerToken));
  assert.deepEqual(monthly.map((row) => row.month), ["2026-11"]);
  const masterMonthly = await json<Array<{ month: string }>>(await call("GET", "/finance/monthly?months=24", masterToken));
  assert.ok(masterMonthly.length > 1);
});

test("el socio puede crear y emitir albaranes y facturas, pero con fecha dentro del periodo", async () => {
  const noteResponse = await call("POST", "/delivery-notes", partnerToken, { contactId: customerId, series: "A", issueDate: "2026-11-18" });
  assert.equal(noteResponse.status, 201);
  const note = await json<{ id: string }>(noteResponse);
  assert.equal((await call("POST", `/delivery-notes/${note.id}/lines`, partnerToken, { productId, quantity: "5" })).status, 201);
  assert.equal((await call("POST", `/delivery-notes/${note.id}/issue`, partnerToken)).status, 200);

  assert.equal((await call("POST", "/delivery-notes", partnerToken, { contactId: customerId, series: "A", issueDate: "2026-10-30" })).status, 403);
  assert.equal((await call("POST", "/invoices", partnerToken, { contactId: customerId, series: "F", issueDate: "2026-10-30" })).status, 403);

  const invoiceResponse = await call("POST", "/invoices", partnerToken, { contactId: customerId, series: "F", issueDate: "2026-11-18" });
  assert.equal(invoiceResponse.status, 201);
  const invoice = await json<{ id: string }>(invoiceResponse);
  assert.equal((await call("POST", `/invoices/${invoice.id}/lines`, partnerToken, { productId, quantity: "3" })).status, 201);
  assert.equal((await call("POST", `/invoices/${invoice.id}/issue`, partnerToken)).status, 200);
});

test("el socio NO puede anular, borrar, cobrar, editar emitidos ni facturar albaranes antiguos", async () => {
  assert.equal((await call("POST", `/invoices/${newInvoiceId}/cancel`, partnerToken)).status, 403);
  assert.equal((await call("POST", `/invoices/${newInvoiceId}/payments`, partnerToken, { amount: "1", paidOn: "2026-11-20", method: "cash" })).status, 403);
  assert.equal((await call("PATCH", `/invoices/${newInvoiceId}`, partnerToken, { notes: "cambio" })).status, 403, "factura emitida: no editable");
  assert.equal((await call("POST", `/invoices/${newInvoiceId}/lines`, partnerToken, { productId, quantity: "1" })).status, 403);
  assert.equal((await call("DELETE", `/delivery-notes/${newNoteId}`, partnerToken)).status, 403);
  assert.equal((await call("POST", `/delivery-notes/${newNoteId}/cancel`, partnerToken)).status, 403);
  assert.equal((await call("POST", "/delivery-notes/from-last", partnerToken, { contactId: customerId })).status, 403);
  assert.equal((await call("POST", "/invoices/from-delivery-notes", partnerToken, { deliveryNoteIds: [oldNoteId], series: "F", issueDate: "2026-11-20" })).status, 404);
});

test("el maestro sigue viéndolo todo y modificándolo todo", async () => {
  const invoices = await json<{ items: Array<{ id: string }> }>(await call("GET", "/invoices?pageSize=100", masterToken));
  assert.ok(invoices.items.some((item) => item.id === oldInvoiceId));
  assert.equal((await call("GET", `/invoices/${oldInvoiceId}`, masterToken)).status, 200);
  assert.equal((await call("GET", "/purchases", masterToken)).status, 200);
  assert.equal((await call("PATCH", `/products/${productId}`, masterToken, { salePrice: "1.5000" })).status, 200);
});

test("al dar de baja a un socio pierde el acceso de inmediato y no puede volver a entrar", async () => {
  assert.equal((await call("GET", "/invoices", partnerToken)).status, 200);
  assert.equal((await call("DELETE", `/team/members/${partnerAccessIds[0]}`, masterToken)).status, 204);
  assert.equal((await call("GET", "/invoices", partnerToken)).status, 401, "el token existente deja de valer");
  await assert.rejects(
    () => auth.googleLogin(PARTNERS[0]!, "Socio Uno"),
    (error: unknown) => (error as { code?: string }).code === "google_account_not_authorized",
  );
  assert.equal((await call("DELETE", `/team/members/${partnerAccessIds[0]}`, masterToken)).status, 404, "ya estaba dado de baja");
  // Se libera una plaza para otro socio.
  assert.equal((await call("POST", "/team/members", masterToken, { email: "nuevo@example.test" })).status, 201);
});
