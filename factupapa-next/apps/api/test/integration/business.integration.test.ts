import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../../src/app.js";
import { bootstrapInitialAccount } from "../../src/auth/bootstrap.js";
import { hashPassword } from "../../src/auth/password.js";
import { AuthRepository } from "../../src/auth/repository.js";
import { AuthService } from "../../src/auth/service.js";
import { ContactService } from "../../src/contacts/service.js";
import { createContactRoutes } from "../../src/contacts/routes.js";
import { createDatabaseProbe, type Database } from "../../src/database/client.js";
import { PricingService } from "../../src/pricing/service.js";
import { createPricingRoutes } from "../../src/pricing/routes.js";
import { ProductService } from "../../src/products/service.js";
import { createProductRoutes } from "../../src/products/routes.js";

const databaseUrl = process.env.DATABASE_URL;
const databaseAdminUrl = process.env.DATABASE_ADMIN_URL;
const jwtSecret = process.env.JWT_SECRET ?? "business-integration-jwt-secret-at-least-32-bytes";
let apiDatabase: Database;
let adminDatabase: Database;
let server: Server;
let baseUrl: string;
let tokenA: string;
let tokenB: string;

interface Tokens { accessToken: string }
interface Entity { id: string; [key: string]: unknown }

async function request(method: string, path: string, body?: unknown, accessToken?: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function login(email: string, password: string): Promise<string> {
  const response = await request("POST", "/auth/login", { email, password });
  assert.equal(response.status, 200);
  return ((await response.json()) as Tokens).accessToken;
}

async function createContact(token: string, overrides: Record<string, unknown> = {}): Promise<Entity> {
  const response = await request("POST", "/contacts", {
    type: "customer",
    legalName: "Cliente de prueba",
    taxId: "TEST-A-001",
    email: "cliente@example.test",
    phone: "+34 600 000 001",
    address: { street: "Calle de prueba 1", postalCode: "28000", city: "Madrid", country: "ES" },
    notes: "Datos exclusivamente ficticios",
    ...overrides,
  }, token);
  assert.equal(response.status, 201);
  return (await response.json()) as Entity;
}

async function createProduct(token: string, overrides: Record<string, unknown> = {}): Promise<Entity> {
  const response = await request("POST", "/products", {
    name: "Patata de prueba",
    description: "Producto ficticio",
    sku: "TEST-SKU-A",
    unit: "kg",
    salePrice: "12.3400",
    estimatedCost: "8.1100",
    taxRate: "4",
    ...overrides,
  }, token);
  assert.equal(response.status, 201);
  return (await response.json()) as Entity;
}

before(async () => {
  assert.ok(databaseUrl, "DATABASE_URL del rol API es obligatoria");
  assert.ok(databaseAdminUrl, "DATABASE_ADMIN_URL es obligatoria");
  adminDatabase = createDatabaseProbe(databaseAdminUrl);
  apiDatabase = createDatabaseProbe(databaseUrl);
  await adminDatabase.pool.query("truncate table audit_events, users, companies cascade");
  await bootstrapInitialAccount(adminDatabase.pool, {
    companyName: "Business Company A",
    email: "business-a@example.test",
    displayName: "Business Owner A",
    password: "business-integration-password-a",
  });
  const passwordHash = await hashPassword("business-integration-password-b");
  await adminDatabase.pool.query(
    `with company as (insert into companies(name) values ('Business Company B') returning id),
          user_account as (
            insert into users(email, display_name, password_hash)
            values ('business-b@example.test', 'Business Owner B', $1) returning id
          )
     insert into memberships(company_id, user_id, role)
     select company.id, user_account.id, 'owner' from company cross join user_account`,
    [passwordHash],
  );
  const auth = await AuthService.create({
    repository: new AuthRepository(apiDatabase.pool), jwtSecret, accessTokenTtlSeconds: 900,
    refreshTokenTtlDays: 30, loginRateLimitMax: 20, loginRateLimitWindowMs: 60_000,
  });
  const contacts = new ContactService(apiDatabase.pool);
  const products = new ProductService(apiDatabase.pool);
  const pricing = new PricingService(apiDatabase.pool);
  server = createApp({
    database: apiDatabase, auth, version: "business-integration",
    routes: [createPricingRoutes(auth, pricing), createContactRoutes(auth, contacts), createProductRoutes(auth, products)],
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  tokenA = await login("business-a@example.test", "business-integration-password-a");
  tokenB = await login("business-b@example.test", "business-integration-password-b");
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (adminDatabase) await adminDatabase.pool.query("truncate table audit_events, users, companies cascade");
  if (apiDatabase) await apiDatabase.close();
  if (adminDatabase) await adminDatabase.close();
});

test("CRUD tenant de contactos, productos y precios específicos", async (context) => {
  let contactA!: Entity;
  let productA!: Entity;

  await context.test("todas las rutas exigen autenticación y rechazan company_id", async () => {
    assert.equal((await request("GET", "/contacts")).status, 401);
    assert.equal((await request("POST", "/contacts", { type: "customer", legalName: "X", companyId: crypto.randomUUID() }, tokenA)).status, 400);
    assert.equal((await request("POST", "/products", {
      name: "X", unit: "unit", salePrice: "1", taxRate: "21", company_id: crypto.randomUUID(),
    }, tokenA)).status, 400);
  });

  await context.test("crea, obtiene y actualiza un contacto estructurado", async () => {
    contactA = await createContact(tokenA);
    assert.equal("companyId" in contactA, false);
    assert.equal(contactA.type, "customer");
    assert.deepEqual(contactA.address, { street: "Calle de prueba 1", postalCode: "28000", city: "Madrid", country: "ES" });
    const get = await request("GET", `/contacts/${contactA.id}`, undefined, tokenA);
    assert.equal(get.status, 200);
    const patch = await request("PATCH", `/contacts/${contactA.id}`, {
      type: "both", tradeName: "Cliente y proveedor", phone: "+34 600 000 099",
    }, tokenA);
    assert.equal(patch.status, 200);
    const updated = (await patch.json()) as Entity;
    assert.equal(updated.type, "both");
    assert.equal(updated.tradeName, "Cliente y proveedor");
    assert.notEqual(updated.updatedAt, contactA.updatedAt);
  });

  await context.test("tax_id duplicado dentro de empresa devuelve 409", async () => {
    const duplicate = await request("POST", "/contacts", {
      type: "supplier", legalName: "Duplicado", taxId: "test-a-001",
    }, tokenA);
    assert.equal(duplicate.status, 409);
    assert.deepEqual(await duplicate.json(), { error: "conflict" });
  });

  await context.test("búsqueda, filtro, paginación y orden estable funcionan", async () => {
    await createContact(tokenA, {
      type: "supplier", legalName: "Proveedor ficticio", taxId: "TEST-A-002",
      email: "proveedor@example.test", phone: "+34 611 222 333",
    });
    const search = await request("GET", "/contacts?search=611%20222&type=supplier&page=1&pageSize=10&sort=name&order=asc", undefined, tokenA);
    assert.equal(search.status, 200);
    const result = (await search.json()) as { items: Entity[]; total: number };
    assert.equal(result.total, 1);
    assert.equal(result.items[0]?.legalName, "Proveedor ficticio");
    const page1 = await request("GET", "/contacts?page=1&pageSize=1&sort=name&order=asc", undefined, tokenA);
    const page2 = await request("GET", "/contacts?page=2&pageSize=1&sort=name&order=asc", undefined, tokenA);
    const id1 = ((await page1.json()) as { items: Entity[] }).items[0]?.id;
    const id2 = ((await page2.json()) as { items: Entity[] }).items[0]?.id;
    assert.notEqual(id1, id2);
  });

  await context.test("crea y actualiza producto con decimales exactos y margen calculado", async () => {
    productA = await createProduct(tokenA);
    assert.equal(productA.salePrice, "12.3400");
    assert.equal(productA.estimatedCost, "8.1100");
    assert.deepEqual(productA.margin, { amount: "4.23", percentage: "34.27" });
    assert.equal("companyId" in productA, false);
    const patch = await request("PATCH", `/products/${productA.id}`, { salePrice: "12.3456", unit: "box" }, tokenA);
    assert.equal(patch.status, 200);
    const updated = (await patch.json()) as Entity;
    assert.equal(updated.salePrice, "12.3456");
    assert.equal(updated.unit, "box");
  });

  await context.test("SKU duplicado dentro de empresa devuelve 409", async () => {
    const duplicate = await request("POST", "/products", {
      name: "Duplicado", sku: "test-sku-a", unit: "unit", salePrice: "1.0001", taxRate: "21",
    }, tokenA);
    assert.equal(duplicate.status, 409);
  });

  await context.test("productos soportan búsqueda, paginación y orden estable", async () => {
    await createProduct(tokenA, { name: "Caja ficticia", sku: "TEST-SKU-A2", unit: "box", salePrice: "3.2000" });
    const search = await request("GET", "/products?search=SKU-A2&page=1&pageSize=10", undefined, tokenA);
    const result = (await search.json()) as { items: Entity[]; total: number };
    assert.equal(result.total, 1);
    assert.equal(result.items[0]?.name, "Caja ficticia");
    const page1 = (await (await request("GET", "/products?page=1&pageSize=1&sort=name&order=asc", undefined, tokenA)).json()) as { items: Entity[] };
    const page2 = (await (await request("GET", "/products?page=2&pageSize=1&sort=name&order=asc", undefined, tokenA)).json()) as { items: Entity[] };
    assert.notEqual(page1.items[0]?.id, page2.items[0]?.id);
  });

  await context.test("precio efectivo usa fallback, precio específico y vuelve al fallback al desactivarlo", async () => {
    let list = await request("GET", `/contacts/${contactA.id}/products?search=Patata`, undefined, tokenA);
    let item = ((await list.json()) as { items: Entity[] }).items.find((entry) => entry.id === productA.id);
    assert.equal(item?.effectivePrice, "12.3456");
    assert.equal(item?.specificPrice, null);
    const put = await request("PUT", `/contacts/${contactA.id}/products/${productA.id}/price`, { price: "9.8765" }, tokenA);
    assert.equal(put.status, 200);
    assert.equal(((await put.json()) as Entity).price, "9.8765");
    list = await request("GET", `/contacts/${contactA.id}/products?search=Patata`, undefined, tokenA);
    item = ((await list.json()) as { items: Entity[] }).items.find((entry) => entry.id === productA.id);
    assert.equal(item?.effectivePrice, "9.8765");
    assert.equal(item?.specificPrice, "9.8765");
    const update = await request("PUT", `/contacts/${contactA.id}/products/${productA.id}/price`, {
      price: "9.8765", isActive: true,
    }, tokenA);
    assert.equal(update.status, 200);
    assert.equal((await request("DELETE", `/contacts/${contactA.id}/products/${productA.id}/price`, undefined, tokenA)).status, 204);
    list = await request("GET", `/contacts/${contactA.id}/products?search=Patata`, undefined, tokenA);
    item = ((await list.json()) as { items: Entity[] }).items.find((entry) => entry.id === productA.id);
    assert.equal(item?.effectivePrice, "12.3456");
  });

  await context.test("dos empresas no leen, modifican ni infieren recursos cruzados", async () => {
    const contactB = await createContact(tokenB, { legalName: "Secreto B", taxId: "TEST-A-001", email: "secret-b@example.test" });
    const productB = await createProduct(tokenB, { name: "Producto secreto B", sku: "TEST-SKU-A" });
    assert.equal((await request("GET", `/contacts/${contactB.id}`, undefined, tokenA)).status, 404);
    assert.equal((await request("PATCH", `/contacts/${contactB.id}`, { legalName: "Ataque" }, tokenA)).status, 404);
    assert.equal((await request("DELETE", `/products/${productB.id}`, undefined, tokenA)).status, 404);
    assert.equal((await request("PUT", `/contacts/${contactB.id}/products/${productB.id}/price`, { price: "1" }, tokenA)).status, 404);
    const search = await request("GET", "/contacts?search=Secreto%20B", undefined, tokenA);
    assert.equal(((await search.json()) as { total: number }).total, 0);
  });

  await context.test("bajas son lógicas, auditadas y autenticación sigue activa", async () => {
    assert.equal((await request("DELETE", `/contacts/${contactA.id}`, undefined, tokenA)).status, 204);
    assert.equal((await request("DELETE", `/products/${productA.id}`, undefined, tokenA)).status, 204);
    assert.equal(((await (await request("GET", `/contacts/${contactA.id}`, undefined, tokenA)).json()) as Entity).isActive, false);
    assert.equal(((await (await request("GET", `/products/${productA.id}`, undefined, tokenA)).json()) as Entity).isActive, false);
    assert.equal((await request("GET", "/me", undefined, tokenA)).status, 200);
    const actions = await adminDatabase.pool.query<{ action: string }>(
      "select action from audit_events where action like 'contact.%' or action like 'product.%' or action like 'contact_product_price.%'",
    );
    for (const action of [
      "contact.created", "contact.updated", "contact.deactivated", "product.created", "product.updated",
      "product.deactivated", "contact_product_price.created", "contact_product_price.updated", "contact_product_price.deactivated",
    ]) assert.ok(actions.rows.some((row) => row.action === action), `Falta ${action}`);
    assert.equal((await apiDatabase.pool.query("select id from contacts")).rowCount, 0);
    assert.equal((await apiDatabase.pool.query("select id from products")).rowCount, 0);
  });
});
