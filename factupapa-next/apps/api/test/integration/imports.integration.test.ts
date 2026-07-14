import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../../src/app.js";
import { bootstrapInitialAccount } from "../../src/auth/bootstrap.js";
import { hashPassword } from "../../src/auth/password.js";
import { AuthRepository } from "../../src/auth/repository.js";
import { AuthService } from "../../src/auth/service.js";
import { createContactRoutes } from "../../src/contacts/routes.js";
import { ContactService } from "../../src/contacts/service.js";
import { createDatabaseProbe, type Database } from "../../src/database/client.js";
import { createImportRoutes } from "../../src/imports/routes.js";
import { ImportService } from "../../src/imports/service.js";
import { createPricingRoutes } from "../../src/pricing/routes.js";
import { PricingService } from "../../src/pricing/service.js";
import { createProductRoutes } from "../../src/products/routes.js";
import { ProductService } from "../../src/products/service.js";

const databaseUrl = process.env.DATABASE_URL;
const databaseAdminUrl = process.env.DATABASE_ADMIN_URL;
const jwtSecret = process.env.JWT_SECRET ?? "imports-integration-jwt-secret-at-least-32-bytes";
let apiDatabase: Database;
let adminDatabase: Database;
let server: Server;
let baseUrl: string;
let tokenA: string;
let tokenB: string;

interface Entity { id: string; [key: string]: unknown }
interface Tokens { accessToken: string }

async function request(method: string, path: string, body?: unknown, token?: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function login(email: string, password: string): Promise<string> {
  const response = await request("POST", "/auth/login", { email, password });
  assert.equal(response.status, 200);
  return ((await response.json()) as Tokens).accessToken;
}

async function validate(entityType: string, sourceFormat: string, content: string, token = tokenA): Promise<Entity> {
  const response = await request("POST", "/imports/validate", { entityType, sourceFormat, content }, token);
  if (response.status !== 201) throw new Error(`validate_failed:${response.status}:${await response.text()}`);
  return (await response.json()) as Entity;
}

async function expectStatus(response: Response, expected: number): Promise<void> {
  if (response.status !== expected) throw new Error(`unexpected_status:${response.status}:expected_${expected}:${await response.text()}`);
}

before(async () => {
  assert.ok(databaseUrl, "DATABASE_URL del rol API es obligatoria");
  assert.ok(databaseAdminUrl, "DATABASE_ADMIN_URL es obligatoria");
  adminDatabase = createDatabaseProbe(databaseAdminUrl);
  apiDatabase = createDatabaseProbe(databaseUrl);
  await adminDatabase.pool.query("truncate table audit_events, users, companies cascade");
  await bootstrapInitialAccount(adminDatabase.pool, {
    companyName: "Import Company A", email: "imports-a@example.test", displayName: "Import Owner A", password: "imports-password-a",
  });
  const passwordHash = await hashPassword("imports-password-b");
  await adminDatabase.pool.query(
    `with company as (insert into companies(name) values ('Import Company B') returning id),
          user_account as (insert into users(email, display_name, password_hash) values ('imports-b@example.test','Import Owner B',$1) returning id)
     insert into memberships(company_id,user_id,role) select company.id,user_account.id,'owner' from company cross join user_account`,
    [passwordHash],
  );
  const auth = await AuthService.create({
    repository: new AuthRepository(apiDatabase.pool), jwtSecret, accessTokenTtlSeconds: 900,
    refreshTokenTtlDays: 30, loginRateLimitMax: 20, loginRateLimitWindowMs: 60_000,
  });
  const imports = new ImportService(apiDatabase.pool, { maximumBytes: 32_768, maximumRows: 100, previewRows: 10 });
  const contacts = new ContactService(apiDatabase.pool);
  const products = new ProductService(apiDatabase.pool);
  const pricing = new PricingService(apiDatabase.pool);
  server = createApp({
    database: apiDatabase, auth, version: "imports-integration",
    routes: [createImportRoutes(auth, imports), createPricingRoutes(auth, pricing), createContactRoutes(auth, contacts), createProductRoutes(auth, products)],
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  tokenA = await login("imports-a@example.test", "imports-password-a");
  tokenB = await login("imports-b@example.test", "imports-password-b");
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (adminDatabase) await adminDatabase.pool.query("truncate table audit_events, users, companies cascade");
  if (apiDatabase) await apiDatabase.close();
  if (adminDatabase) await adminDatabase.close();
});

test("importación segura tenant de contactos, productos y precios", async (context) => {
  let contactBatch!: Entity;
  let productBatch!: Entity;

  await context.test("rutas autenticadas, CSV válido y rechazo de company_id", async () => {
    await expectStatus(await request("GET", "/imports"), 401);
    await expectStatus(await request("POST", "/imports/validate", {
      entityType: "contacts", sourceFormat: "json",
      content: JSON.stringify([{ type: "customer", legalName: "Inyección", companyId: crypto.randomUUID() }]),
    }, tokenA), 400);
    contactBatch = await validate(
      "contacts", "csv",
      "type,legal_name,trade_name,tax_id,email,phone,address_street,city,country,notes,is_active\ncustomer,Cliente Importado,,IMP-A-001,CLIENTE@EXAMPLE.TEST,+34600000001,Calle Ficticia 1,Madrid,ES,Dato ficticio,true\n",
    );
    assert.equal(contactBatch.status, "validated");
    assert.equal((contactBatch.validationSummary as Entity).newRows, 1);
    assert.equal(((contactBatch.rows as Entity[])[0]?.normalizedData as Entity).email, "cliente@example.test");
  });

  await context.test("confirma una vez, reusa checksum y bloquea confirmación repetida", async () => {
    const confirm = await request("POST", `/imports/${contactBatch.id}/confirm`, { strategy: "fail_on_conflict" }, tokenA);
    assert.equal(confirm.status, 200);
    assert.equal(((await confirm.json()) as Entity).created, 1);
    const retry = await validate(
      "contacts", "csv",
      "type,legal_name,trade_name,tax_id,email,phone,address_street,city,country,notes,is_active\ncustomer,Cliente Importado,,IMP-A-001,CLIENTE@EXAMPLE.TEST,+34600000001,Calle Ficticia 1,Madrid,ES,Dato ficticio,true\n",
    );
    assert.equal(retry.id, contactBatch.id);
    assert.equal(retry.reused, true);
    assert.equal((await request("POST", `/imports/${contactBatch.id}/confirm`, { strategy: "skip_existing" }, tokenA)).status, 409);
  });

  await context.test("detecta DB y aplica skip_existing, fail_on_conflict y update_existing", async () => {
    const skipBatch = await validate("contacts", "json", JSON.stringify([
      { type: "both", legalName: "No debe sobrescribir", taxId: "IMP-A-001", email: "nuevo@example.test" },
    ]));
    assert.equal((skipBatch.validationSummary as Entity).possibleUpdates, 1);
    assert.equal((await request("POST", `/imports/${skipBatch.id}/confirm`, { strategy: "fail_on_conflict" }, tokenA)).status, 409);
    const skipped = await request("POST", `/imports/${skipBatch.id}/confirm`, { strategy: "skip_existing" }, tokenA);
    assert.equal(skipped.status, 200);
    assert.equal(((await skipped.json()) as Entity).skipped, 1);
    const updateBatch = await validate("contacts", "json", JSON.stringify([
      { type: "both", legalName: "Cliente Actualizado", taxId: "IMP-A-001", email: "actualizado@example.test" },
    ]));
    assert.equal((await request("POST", `/imports/${updateBatch.id}/confirm`, { strategy: "update_existing" }, tokenA)).status, 200);
    const contacts = (await (await request("GET", "/contacts?search=IMP-A-001", undefined, tokenA)).json()) as { items: Entity[] };
    assert.equal(contacts.items[0]?.legalName, "Cliente Actualizado");
  });

  await context.test("JSON de productos conserva precisión y doble confirmación concurrente se bloquea", async () => {
    productBatch = await validate("products", "json", JSON.stringify([
      { name: "Producto Importado", sku: "IMP-SKU-001", unit: "kg", salePrice: "12.3456", estimatedCost: "8.0001", taxRate: "4" },
    ]));
    const results = await Promise.all([
      request("POST", `/imports/${productBatch.id}/confirm`, { strategy: "fail_on_conflict" }, tokenA),
      request("POST", `/imports/${productBatch.id}/confirm`, { strategy: "fail_on_conflict" }, tokenA),
    ]);
    assert.deepEqual(results.map((response) => response.status).sort(), [200, 409]);
    const products = (await (await request("GET", "/products?search=IMP-SKU-001", undefined, tokenA)).json()) as { items: Entity[] };
    assert.equal(products.items[0]?.salePrice, "12.3456");
    assert.equal(products.items[0]?.estimatedCost, "8.0001");
  });

  await context.test("precios resuelven NIF y SKU, rechazan inexistentes y aplican valor exacto", async () => {
    const invalid = await validate("contact_product_prices", "csv", "tax_id,sku,price,valid_from,is_active\nNO-EXISTE,IMP-SKU-001,9.8765,2020-01-01,true\n");
    assert.equal(invalid.invalidRows, 1);
    assert.equal((await request("POST", `/imports/${invalid.id}/confirm`, { strategy: "fail_on_conflict" }, tokenA)).status, 400);
    const batch = await validate("contact_product_prices", "csv", "tax_id,sku,price,valid_from,is_active\nIMP-A-001,IMP-SKU-001,9.8765,2020-01-01,true\n");
    assert.equal((await request("POST", `/imports/${batch.id}/confirm`, { strategy: "fail_on_conflict" }, tokenA)).status, 200);
    const contacts = (await (await request("GET", "/contacts?search=IMP-A-001", undefined, tokenA)).json()) as { items: Entity[] };
    const prices = (await (await request("GET", `/contacts/${contacts.items[0]?.id}/products?search=IMP-SKU-001`, undefined, tokenA)).json()) as { items: Entity[] };
    assert.equal(prices.items[0]?.effectivePrice, "9.8765");
  });

  await context.test("cancelación, listado y aislamiento entre empresas", async () => {
    const cancelled = await validate("products", "csv", "name,sku,unit,sale_price,tax_rate\nCancelado,CANCEL-1,unit,1.0000,21\n");
    assert.equal((await request("POST", `/imports/${cancelled.id}/cancel`, {}, tokenA)).status, 204);
    assert.equal((await request("POST", `/imports/${cancelled.id}/confirm`, { strategy: "skip_existing" }, tokenA)).status, 409);
    assert.equal((await request("GET", `/imports/${contactBatch.id}`, undefined, tokenB)).status, 404);
    const listB = (await (await request("GET", "/imports", undefined, tokenB)).json()) as { total: number };
    assert.equal(listB.total, 0);
    const sameForB = await validate(
      "contacts", "csv",
      "type,legal_name,trade_name,tax_id,email,phone,address_street,city,country,notes,is_active\ncustomer,Cliente Importado,,IMP-A-001,CLIENTE@EXAMPLE.TEST,+34600000001,Calle Ficticia 1,Madrid,ES,Dato ficticio,true\n",
      tokenB,
    );
    assert.notEqual(sameForB.id, contactBatch.id);
  });

  await context.test("un fallo inesperado revierte datos y conserva diagnóstico", async () => {
    const batch = await validate("products", "json", JSON.stringify([
      { name: "Producto que hará rollback", sku: "ROLLBACK-1", unit: "unit", salePrice: "1.0000", taxRate: "21" },
      { name: "Segundo producto", sku: "ROLLBACK-2", unit: "unit", salePrice: "2.0000", taxRate: "21" },
    ]));
    await adminDatabase.pool.query(
      `update import_batch_rows set normalized_data=jsonb_set(normalized_data,'{name}',to_jsonb(repeat('x',201)))
       where batch_id=$1 and row_number=2`, [batch.id],
    );
    assert.equal((await request("POST", `/imports/${batch.id}/confirm`, { strategy: "fail_on_conflict" }, tokenA)).status, 500);
    const products = (await (await request("GET", "/products?search=ROLLBACK", undefined, tokenA)).json()) as { total: number };
    assert.equal(products.total, 0);
    const detail = (await (await request("GET", `/imports/${batch.id}`, undefined, tokenA)).json()) as Entity;
    assert.equal(detail.status, "failed");
    assert.equal((detail.validationSummary as Entity).failure, "transaction_rolled_back");
  });

  await context.test("audita validar, confirmar, cancelar y fallar sin contenido completo", async () => {
    const events = await adminDatabase.pool.query<{ action: string; afterData: Record<string, unknown> }>(
      `select action, after_data as "afterData" from audit_events where action like 'import.%'`,
    );
    for (const action of ["import.validated", "import.confirmed", "import.cancelled", "import.failed"]) {
      assert.ok(events.rows.some((row) => row.action === action), `Falta ${action}`);
    }
    assert.ok(events.rows.every((row) => !("content" in (row.afterData ?? {}))));
    assert.equal((await apiDatabase.pool.query("select id from import_batches")).rowCount, 0);
    assert.equal((await apiDatabase.pool.query("select id from import_batch_rows")).rowCount, 0);
    assert.equal((await request("GET", "/me", undefined, tokenA)).status, 200);
  });
});
