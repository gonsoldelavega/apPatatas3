import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../../src/app.js";
import { bootstrapInitialAccount } from "../../src/auth/bootstrap.js";
import { hashPassword } from "../../src/auth/password.js";
import { AuthRepository, type SessionIdentity } from "../../src/auth/repository.js";
import { AuthService } from "../../src/auth/service.js";
import { createDocumentLookup } from "../../src/authz/guard.js";
import { createDatabaseProbe, withTenantTransaction, type Database } from "../../src/database/client.js";
import { DeliveryNoteService } from "../../src/delivery-notes/service.js";
import { FinanceService } from "../../src/finance/service.js";
import { InvoiceService } from "../../src/invoices/service.js";
import { createTaxRoutes } from "../../src/tax/routes.js";
import { TaxService } from "../../src/tax/service.js";

const databaseUrl = process.env.DATABASE_URL;
const adminUrl = process.env.DATABASE_ADMIN_URL;
let api: Database;
let admin: Database;
let server: Server;
let baseUrl: string;
let ownerToken = "";
let otherToken = "";
let partnerToken = "";
let owner: SessionIdentity;

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

before(async () => {
  assert.ok(databaseUrl && adminUrl);
  admin = createDatabaseProbe(adminUrl);
  api = createDatabaseProbe(databaseUrl);
  await admin.pool.query("truncate table audit_events, users, companies cascade");
  await bootstrapInitialAccount(admin.pool, {
    companyName: "Gestoria A",
    email: "tax-a@example.test",
    displayName: "Owner A",
    password: "tax-integration-password-a",
  });
  const passwordHash = await hashPassword("tax-integration-password-b");
  await admin.pool.query(
    `with c as (insert into companies(name) values ('Gestoria B') returning id),
          u as (insert into users(email, display_name, password_hash) values ('tax-b@example.test','Owner B',$1) returning id)
     insert into memberships(company_id, user_id, role) select c.id, u.id, 'owner' from c cross join u`,
    [passwordHash],
  );
  const auth = await AuthService.create({
    repository: new AuthRepository(api.pool),
    jwtSecret: "tax-integration-jwt-secret-at-least-32-bytes",
    accessTokenTtlSeconds: 900,
    refreshTokenTtlDays: 30,
    loginRateLimitMax: 50,
    loginRateLimitWindowMs: 60_000,
  });
  const row = await admin.pool.query<{ companyId: string; userId: string }>(
    `select m.company_id "companyId", m.user_id "userId" from memberships m join users u on u.id=m.user_id where u.email='tax-a@example.test'`,
  );
  owner = { ...row.rows[0]!, familyId: "00000000-0000-4000-8000-0000000000bb", email: "tax-a@example.test", displayName: "Owner A", companyName: "Gestoria A", role: "owner" };

  // Datos: 2 facturas emitidas en el 4T de 2026 (IVA 4 %).
  const { customerId, productId } = await withTenantTransaction(api.pool, owner, async (client) => {
    const c = await client.query<{ id: string }>(
      `insert into contacts(company_id,kind,legal_name,tax_id,address) values($1,'customer','Cliente','TEST-TAX-C','{}') returning id`,
      [owner.companyId],
    );
    const p = await client.query<{ id: string }>(
      `insert into products(company_id,name,sku,unit,sale_price,tax_rate) values($1,'Patata','TEST-TAX-P','kg',1,4) returning id`,
      [owner.companyId],
    );
    return { customerId: c.rows[0]!.id, productId: p.rows[0]!.id };
  });
  const delivery = new DeliveryNoteService(api.pool);
  const invoices = new InvoiceService(api.pool);
  for (const [issueDate, qty] of [["2026-10-05", "100"], ["2026-11-20", "50"]] as const) {
    const note = await delivery.create(owner, { contactId: customerId, series: "A", issueDate });
    await delivery.addLine(owner, note!.id, { productId, quantity: qty });
    await delivery.issue(owner, note!.id);
    const inv = await invoices.fromDeliveryNotes(owner, { deliveryNoteIds: [note!.id], series: "F", issueDate });
    await invoices.issue(owner, inv!.id);
  }

  // Compras registradas: una confirmada (IVA 4 %), otra confirmada y luego borrada (no cuenta).
  const supplierId = await withTenantTransaction(api.pool, owner, async (client) =>
    (await client.query<{ id: string }>(
      `insert into contacts(company_id,kind,legal_name,tax_id,address) values($1,'supplier','Proveedor','TEST-TAX-S','{}') returning id`,
      [owner.companyId],
    )).rows[0]!.id,
  );
  const finance = new FinanceService(api.pool);
  type PurchaseInput = Parameters<FinanceService["createPurchase"]>[1];
  const purchase = (issueDate: string, quantity: string, number: string) =>
    ({
      supplierId,
      supplierInvoiceNumber: number,
      issueDate,
      category: "mercancia",
      status: "draft",
      lines: [{ description: "Patata", quantity, unit: "kg", unitCost: "0.6", taxRate: "4" }],
    }) as unknown as PurchaseInput;
  const confirmed = (await finance.createPurchase(owner, purchase("2026-11-05", "100", "COMPRA-1"))) as { id: string };
  await finance.transitionPurchase(owner, confirmed.id, "confirmed");
  const removed = (await finance.createPurchase(owner, purchase("2026-11-06", "500", "COMPRA-BORRADA"))) as { id: string };
  await finance.transitionPurchase(owner, removed.id, "confirmed");
  await finance.deletePurchase(owner, removed.id);
  // Albarán emitido y SIN facturar (venta sin factura): no debe entrar en la previsión.
  const looseNote = await delivery.create(owner, { contactId: customerId, series: "A", issueDate: "2026-11-25" });
  await delivery.addLine(owner, looseNote!.id, { productId, quantity: "1000" });
  await delivery.issue(owner, looseNote!.id);

  server = createApp({
    database: api,
    auth,
    version: "tax-integration",
    corsAllowedOrigins: ["http://integration.test"],
    documents: createDocumentLookup(api.pool),
    routes: [createTaxRoutes(auth, new TaxService(api.pool))],
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  ownerToken = (await auth.googleLogin("tax-a@example.test", "Owner A")).accessToken;
  otherToken = (await auth.googleLogin("tax-b@example.test", "Owner B")).accessToken;
  await admin.pool.query("select * from team_add_partner($1,$2,$3)", [owner.companyId, owner.userId, "socio-tax@example.test"]);
  partnerToken = (await auth.googleLogin("socio-tax@example.test", "Socio")).accessToken;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await api.pool.end();
  await admin.pool.end();
});

test("la previsión del 4T incluye cada factura registrada (ventas y compras) y deja fuera los albaranes", async () => {
  const response = await call("GET", "/tax/forecast?year=2026&quarter=4", ownerToken);
  assert.equal(response.status, 200);
  const forecast = (await response.json()) as {
    label: string;
    incomplete: boolean;
    vat: { salesBase: number; salesTax: number; purchaseBase: number; deductibleTax: number; balance: number };
    irpf: { accumulatedIncome: number; accumulatedExpenses: number; net: number; result: number };
    quality: { salesCount: number; purchaseCount: number; warnings: string[] };
    reserve: number;
  };
  const round = (value: number) => Math.round(value * 100) / 100;
  assert.equal(forecast.label, "4T 2026");
  // Ventas: 2 facturas emitidas (100 kg y 50 kg a 1 €). El albarán suelto de 1000 kg NO cuenta.
  assert.equal(forecast.quality.salesCount, 2);
  assert.equal(forecast.vat.salesBase, 150);
  assert.equal(round(forecast.vat.salesTax), 6);
  // Compras: 1 confirmada (100 kg x 0,60 = 60 € con IVA 4 % = 2,40 €). La borrada NO cuenta.
  assert.equal(forecast.quality.purchaseCount, 1);
  assert.equal(round(forecast.vat.purchaseBase), 60);
  assert.equal(round(forecast.vat.deductibleTax), 2.4, "el IVA de cada compra registrada se deduce");
  assert.equal(round(forecast.vat.balance), 3.6);
  // 130: ingresos y gastos de las facturas registradas del año
  assert.equal(forecast.irpf.accumulatedIncome, 150);
  assert.equal(round(forecast.irpf.accumulatedExpenses), 60);
  assert.equal(round(forecast.irpf.net), 90);
  assert.equal(round(forecast.irpf.result), 18);
  assert.deepEqual(forecast.quality.warnings, []);
  assert.equal(forecast.incomplete, false);
  assert.equal(round(forecast.reserve), 21.6);
});

test("otro trimestre sin ventas no mezcla datos", async () => {
  const forecast = (await (await call("GET", "/tax/forecast?year=2026&quarter=2", ownerToken)).json()) as {
    vat: { salesBase: number };
    quality: { salesCount: number };
  };
  assert.equal(forecast.quality.salesCount, 0);
  assert.equal(forecast.vat.salesBase, 0);
});

test("perfil fiscal: valores por defecto, guardado y validación", async () => {
  const initial = (await (await call("GET", "/tax/profile", ownerToken)).json()) as { incomeTaxRegime: string };
  assert.equal(initial.incomeTaxRegime, "direct");
  const saved = await call("PUT", "/tax/profile", ownerToken, { incomeTaxRegime: "objective", irpfRate: "15", annualMinoration: "100" });
  assert.equal(saved.status, 200);
  assert.equal(((await saved.json()) as { incomeTaxRegime: string }).incomeTaxRegime, "objective");
  assert.equal((await call("PUT", "/tax/profile", ownerToken, { irpfRate: "250" })).status, 400);
  assert.equal((await call("PUT", "/tax/profile", ownerToken, { irpfRate: "abc" })).status, 400);
});

test("parámetros inválidos dan 400 (no 500)", async () => {
  for (const query of ["year=1999&quarter=1", "year=2026&quarter=5", "year=2026", "quarter=2", "year=x&quarter=y"]) {
    assert.equal((await call("GET", `/tax/forecast?${query}`, ownerToken)).status, 400, query);
  }
});

test("cada empresa solo ve sus datos fiscales (aislamiento entre empresas)", async () => {
  await call("PUT", "/tax/profile", ownerToken, { incomeTaxRegime: "not_applicable", irpfRate: "20", annualMinoration: "0" });
  const other = (await (await call("GET", "/tax/profile", otherToken)).json()) as { incomeTaxRegime: string };
  assert.equal(other.incomeTaxRegime, "direct", "la empresa B conserva su perfil por defecto");
  const otherForecast = (await (await call("GET", "/tax/forecast?year=2026&quarter=4", otherToken)).json()) as { quality: { salesCount: number } };
  assert.equal(otherForecast.quality.salesCount, 0);
});

test("liquidaciones: guardar, listar y validar", async () => {
  const saved = await call("POST", "/tax/settlements", ownerToken, { taxModel: "303", year: 2026, quarter: 3, estimatedAmount: "123.45", status: "filed", filedAmount: "120.00", filedAt: "2026-10-20" });
  assert.equal(saved.status, 201);
  const list = (await (await call("GET", "/tax/settlements", ownerToken)).json()) as Array<{ taxModel: string; quarter: number }>;
  assert.ok(list.some((item) => item.taxModel === "303" && item.quarter === 3));
  assert.equal((await call("POST", "/tax/settlements", ownerToken, { taxModel: "303", year: 2026, quarter: 9, estimatedAmount: "1" })).status, 400);
  assert.equal((await call("POST", "/tax/settlements", ownerToken, { taxModel: "303", year: 2026, quarter: 1, estimatedAmount: "1", status: "inventado" })).status, 400);
  assert.equal((await call("POST", "/tax/settlements", ownerToken, { taxModel: "303", year: 2026, quarter: 1, estimatedAmount: "no" })).status, 400);
});

test("un socio NO puede ver ni tocar la gestoría", async () => {
  assert.equal((await call("GET", "/tax/forecast?year=2026&quarter=4", partnerToken)).status, 403);
  assert.equal((await call("GET", "/tax/profile", partnerToken)).status, 403);
  assert.equal((await call("PUT", "/tax/profile", partnerToken, { irpfRate: "1" })).status, 403);
  assert.equal((await call("POST", "/tax/settlements", partnerToken, { taxModel: "303", year: 2026, quarter: 4, estimatedAmount: "1" })).status, 403);
});

test("sin sesión no hay acceso", async () => {
  assert.equal((await call("GET", "/tax/forecast?year=2026&quarter=4")).status, 401);
});
