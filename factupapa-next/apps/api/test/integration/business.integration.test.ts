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
import {
  createDatabaseProbe,
  type Database,
} from "../../src/database/client.js";
import { createFinanceRoutes } from "../../src/finance/routes.js";
import { FinanceService } from "../../src/finance/service.js";
import { AccountsService } from "../../src/accounts/service.js";
import { createAccountsRoutes } from "../../src/accounts/routes.js";
import { InvoiceService } from "../../src/invoices/service.js";
import { createInvoiceRoutes } from "../../src/invoices/routes.js";
import { PricingService } from "../../src/pricing/service.js";
import { createPricingRoutes } from "../../src/pricing/routes.js";
import { ProductService } from "../../src/products/service.js";
import { createProductRoutes } from "../../src/products/routes.js";

const databaseUrl = process.env.DATABASE_URL;
const databaseAdminUrl = process.env.DATABASE_ADMIN_URL;
const jwtSecret =
  process.env.JWT_SECRET ?? "business-integration-jwt-secret-at-least-32-bytes";
let apiDatabase: Database;
let adminDatabase: Database;
let server: Server;
let baseUrl: string;
let tokenA: string;
let tokenB: string;

interface Tokens {
  accessToken: string;
}
interface Entity {
  id: string;
  [key: string]: unknown;
}

async function request(
  method: string,
  path: string,
  body?: unknown,
  accessToken?: string,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(body === undefined ? {} : { origin: "http://integration.test" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function login(email: string, password: string): Promise<string> {
  const response = await request("POST", "/auth/login", { email, password });
  assert.equal(response.status, 200);
  return ((await response.json()) as Tokens).accessToken;
}

async function createContact(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<Entity> {
  const response = await request(
    "POST",
    "/contacts",
    {
      type: "customer",
      legalName: "Cliente de prueba",
      taxId: "TEST-A-001",
      email: "cliente@example.test",
      phone: "+34 600 000 001",
      address: {
        street: "Calle de prueba 1",
        postalCode: "28000",
        city: "Madrid",
        country: "ES",
      },
      notes: "Datos exclusivamente ficticios",
      ...overrides,
    },
    token,
  );
  assert.equal(response.status, 201);
  return (await response.json()) as Entity;
}

async function createProduct(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<Entity> {
  const response = await request(
    "POST",
    "/products",
    {
      name: "Patata de prueba",
      description: "Producto ficticio",
      sku: "TEST-SKU-A",
      unit: "kg",
      salePrice: "12.3400",
      estimatedCost: "8.1100",
      taxRate: "4",
      ...overrides,
    },
    token,
  );
  assert.equal(response.status, 201);
  return (await response.json()) as Entity;
}

before(async () => {
  assert.ok(databaseUrl, "DATABASE_URL del rol API es obligatoria");
  assert.ok(databaseAdminUrl, "DATABASE_ADMIN_URL es obligatoria");
  adminDatabase = createDatabaseProbe(databaseAdminUrl);
  apiDatabase = createDatabaseProbe(databaseUrl);
  await adminDatabase.pool.query(
    "truncate table audit_events, users, companies cascade",
  );
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
    repository: new AuthRepository(apiDatabase.pool),
    jwtSecret,
    accessTokenTtlSeconds: 900,
    refreshTokenTtlDays: 30,
    loginRateLimitMax: 20,
    loginRateLimitWindowMs: 60_000,
  });
  const contacts = new ContactService(apiDatabase.pool);
  const registryCsv = [
    Array.from({ length: 22 }, (_, index) => `col${index + 1}`).join(","),
    [
      "22/07/2026", "22/07/2026 12:00:00", "COMPRA", "FACTURA",
      "REG-001", "Proveedor del registro", "B12345678", "Patata de prueba",
      "Materia prima", "100,00", "4", "4,00", "104,00", "PAGADA",
      "Transferencia", "07", "3", "2026",
      "https://drive.google.com/file/d/REGISTRY_FILE_001/view",
      "factura-registro.pdf", "sí", "Documento ficticio de integración",
    ].map((value) => `"${value.replaceAll('"', '""')}"`).join(","),
  ].join("\n");
  const finance = new FinanceService(
    apiDatabase.pool,
    undefined,
    undefined,
    { url: `data:text/csv;charset=utf-8,${encodeURIComponent(registryCsv)}` },
  );
  const products = new ProductService(apiDatabase.pool);
  const pricing = new PricingService(apiDatabase.pool);
  const accounts = new AccountsService(apiDatabase.pool);
  const invoices = new InvoiceService(apiDatabase.pool);
  server = createApp({
    database: apiDatabase,
    auth,
    version: "business-integration",
    corsAllowedOrigins: ["http://integration.test"],
    routes: [
      createAccountsRoutes(auth, accounts),
      createInvoiceRoutes(auth, invoices),
      createFinanceRoutes(auth, finance),
      createPricingRoutes(auth, pricing),
      createContactRoutes(auth, contacts),
      createProductRoutes(auth, products),
    ],
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  tokenA = await login(
    "business-a@example.test",
    "business-integration-password-a",
  );
  tokenB = await login(
    "business-b@example.test",
    "business-integration-password-b",
  );
});

after(async () => {
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  if (adminDatabase)
    await adminDatabase.pool.query(
      "truncate table audit_events, users, companies cascade",
    );
  if (apiDatabase) await apiDatabase.close();
  if (adminDatabase) await adminDatabase.close();
});

test("CRUD tenant de contactos, productos y precios específicos", async (context) => {
  let contactA!: Entity;
  let productA!: Entity;

  await context.test(
    "todas las rutas exigen autenticación y rechazan company_id",
    async () => {
      assert.equal((await request("GET", "/contacts")).status, 401);
      assert.equal(
        (
          await request(
            "POST",
            "/contacts",
            {
              type: "customer",
              legalName: "X",
              companyId: crypto.randomUUID(),
            },
            tokenA,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            "POST",
            "/products",
            {
              name: "X",
              unit: "unit",
              salePrice: "1",
              taxRate: "21",
              company_id: crypto.randomUUID(),
            },
            tokenA,
          )
        ).status,
        400,
      );
    },
  );

  await context.test(
    "crea, obtiene y actualiza un contacto estructurado",
    async () => {
      contactA = await createContact(tokenA);
      assert.equal("companyId" in contactA, false);
      assert.equal(contactA.type, "customer");
      assert.deepEqual(contactA.address, {
        street: "Calle de prueba 1",
        postalCode: "28000",
        city: "Madrid",
        country: "ES",
      });
      const get = await request(
        "GET",
        `/contacts/${contactA.id}`,
        undefined,
        tokenA,
      );
      assert.equal(get.status, 200);
      const patch = await request(
        "PATCH",
        `/contacts/${contactA.id}`,
        {
          type: "both",
          tradeName: "Cliente y proveedor",
          phone: "+34 600 000 099",
        },
        tokenA,
      );
      assert.equal(patch.status, 200);
      const updated = (await patch.json()) as Entity;
      assert.equal(updated.type, "both");
      assert.equal(updated.tradeName, "Cliente y proveedor");
      assert.notEqual(updated.updatedAt, contactA.updatedAt);
    },
  );

  await context.test(
    "tax_id duplicado dentro de empresa devuelve 409",
    async () => {
      const duplicate = await request(
        "POST",
        "/contacts",
        {
          type: "supplier",
          legalName: "Duplicado",
          taxId: "test-a-001",
        },
        tokenA,
      );
      assert.equal(duplicate.status, 409);
      assert.deepEqual(await duplicate.json(), { error: "conflict" });
    },
  );

  await context.test(
    "búsqueda, filtro, paginación y orden estable funcionan",
    async () => {
      await createContact(tokenA, {
        type: "supplier",
        legalName: "Proveedor ficticio",
        taxId: "TEST-A-002",
        email: "proveedor@example.test",
        phone: "+34 611 222 333",
      });
      const search = await request(
        "GET",
        "/contacts?search=611%20222&type=supplier&page=1&pageSize=10&sort=name&order=asc",
        undefined,
        tokenA,
      );
      assert.equal(search.status, 200);
      const result = (await search.json()) as {
        items: Entity[];
        total: number;
      };
      assert.equal(result.total, 1);
      assert.equal(result.items[0]?.legalName, "Proveedor ficticio");
      const page1 = await request(
        "GET",
        "/contacts?page=1&pageSize=1&sort=name&order=asc",
        undefined,
        tokenA,
      );
      const page2 = await request(
        "GET",
        "/contacts?page=2&pageSize=1&sort=name&order=asc",
        undefined,
        tokenA,
      );
      const id1 = ((await page1.json()) as { items: Entity[] }).items[0]?.id;
      const id2 = ((await page2.json()) as { items: Entity[] }).items[0]?.id;
      assert.notEqual(id1, id2);
    },
  );

  await context.test(
    "crea y actualiza producto con decimales exactos y margen calculado",
    async () => {
      productA = await createProduct(tokenA);
      assert.equal(productA.salePrice, "12.3400");
      assert.equal(productA.estimatedCost, "8.1100");
      assert.deepEqual(productA.margin, {
        amount: "4.23",
        percentage: "34.27",
      });
      assert.equal("companyId" in productA, false);
      const patch = await request(
        "PATCH",
        `/products/${productA.id}`,
        { salePrice: "12.3456", unit: "box" },
        tokenA,
      );
      assert.equal(patch.status, 200);
      const updated = (await patch.json()) as Entity;
      assert.equal(updated.salePrice, "12.3456");
      assert.equal(updated.unit, "box");
    },
  );

  await context.test(
    "SKU duplicado dentro de empresa devuelve 409",
    async () => {
      const duplicate = await request(
        "POST",
        "/products",
        {
          name: "Duplicado",
          sku: "test-sku-a",
          unit: "unit",
          salePrice: "1.0001",
          taxRate: "21",
        },
        tokenA,
      );
      assert.equal(duplicate.status, 409);
    },
  );

  await context.test(
    "productos soportan búsqueda, paginación y orden estable",
    async () => {
      await createProduct(tokenA, {
        name: "Caja ficticia",
        sku: "TEST-SKU-A2",
        unit: "box",
        salePrice: "3.2000",
      });
      const search = await request(
        "GET",
        "/products?search=SKU-A2&page=1&pageSize=10",
        undefined,
        tokenA,
      );
      const result = (await search.json()) as {
        items: Entity[];
        total: number;
      };
      assert.equal(result.total, 1);
      assert.equal(result.items[0]?.name, "Caja ficticia");
      const page1 = (await (
        await request(
          "GET",
          "/products?page=1&pageSize=1&sort=name&order=asc",
          undefined,
          tokenA,
        )
      ).json()) as { items: Entity[] };
      const page2 = (await (
        await request(
          "GET",
          "/products?page=2&pageSize=1&sort=name&order=asc",
          undefined,
          tokenA,
        )
      ).json()) as { items: Entity[] };
      assert.notEqual(page1.items[0]?.id, page2.items[0]?.id);
    },
  );

  await context.test(
    "precio efectivo usa fallback, precio específico y vuelve al fallback al desactivarlo",
    async () => {
      let list = await request(
        "GET",
        `/contacts/${contactA.id}/products?search=Patata`,
        undefined,
        tokenA,
      );
      let item = ((await list.json()) as { items: Entity[] }).items.find(
        (entry) => entry.id === productA.id,
      );
      assert.equal(item?.effectivePrice, "12.3456");
      assert.equal(item?.specificPrice, null);
      const put = await request(
        "PUT",
        `/contacts/${contactA.id}/products/${productA.id}/price`,
        { price: "9.8765" },
        tokenA,
      );
      assert.equal(put.status, 200);
      assert.equal(((await put.json()) as Entity).price, "9.8765");
      list = await request(
        "GET",
        `/contacts/${contactA.id}/products?search=Patata`,
        undefined,
        tokenA,
      );
      item = ((await list.json()) as { items: Entity[] }).items.find(
        (entry) => entry.id === productA.id,
      );
      assert.equal(item?.effectivePrice, "9.8765");
      assert.equal(item?.specificPrice, "9.8765");
      const update = await request(
        "PUT",
        `/contacts/${contactA.id}/products/${productA.id}/price`,
        {
          price: "9.8765",
          isActive: true,
        },
        tokenA,
      );
      assert.equal(update.status, 200);
      assert.equal(
        (
          await request(
            "DELETE",
            `/contacts/${contactA.id}/products/${productA.id}/price`,
            undefined,
            tokenA,
          )
        ).status,
        204,
      );
      list = await request(
        "GET",
        `/contacts/${contactA.id}/products?search=Patata`,
        undefined,
        tokenA,
      );
      item = ((await list.json()) as { items: Entity[] }).items.find(
        (entry) => entry.id === productA.id,
      );
      assert.equal(item?.effectivePrice, "12.3456");
    },
  );

  await context.test(
    "dos empresas no leen, modifican ni infieren recursos cruzados",
    async () => {
      const contactB = await createContact(tokenB, {
        legalName: "Secreto B",
        taxId: "TEST-A-001",
        email: "secret-b@example.test",
      });
      const productB = await createProduct(tokenB, {
        name: "Producto secreto B",
        sku: "TEST-SKU-A",
      });
      assert.equal(
        (await request("GET", `/contacts/${contactB.id}`, undefined, tokenA))
          .status,
        404,
      );
      assert.equal(
        (
          await request(
            "PATCH",
            `/contacts/${contactB.id}`,
            { legalName: "Ataque" },
            tokenA,
          )
        ).status,
        404,
      );
      assert.equal(
        (await request("DELETE", `/products/${productB.id}`, undefined, tokenA))
          .status,
        404,
      );
      assert.equal(
        (
          await request(
            "PUT",
            `/contacts/${contactB.id}/products/${productB.id}/price`,
            { price: "1" },
            tokenA,
          )
        ).status,
        404,
      );
      const search = await request(
        "GET",
        "/contacts?search=Secreto%20B",
        undefined,
        tokenA,
      );
      assert.equal(((await search.json()) as { total: number }).total, 0);
    },
  );

  await context.test(
    "sincroniza el registro de Drive sin duplicar compras ni pagos",
    async () => {
      const first = await request(
        "POST",
        "/purchases/registry-sync",
        {},
        tokenA,
      );
      assert.equal(first.status, 200);
      assert.deepEqual(await first.json(), {
        fetched: 1,
        imported: 1,
        skipped: 0,
        drafts: 0,
        paid: 1,
      });
      const second = await request(
        "POST",
        "/purchases/registry-sync",
        {},
        tokenA,
      );
      assert.equal(second.status, 200);
      assert.deepEqual(await second.json(), {
        fetched: 1,
        imported: 0,
        skipped: 1,
        drafts: 0,
        paid: 0,
      });
      const list = await request(
        "GET",
        "/purchases?from=2026-07-22&to=2026-07-22",
        undefined,
        tokenA,
      );
      const items = (await list.json()) as Entity[];
      const imported = items.find(
        (item) => item.supplierInvoiceNumber === "REG-001",
      );
      assert.equal(imported?.status, "confirmed");
      assert.equal(imported?.paymentStatus, "paid");
      assert.equal(imported?.sourceRegistryFilename, "factura-registro.pdf");
    },
  );

  await context.test(
    "envases, cobros parciales y cuenta del cliente conservan sus snapshots",
    async () => {
      const productUpdate = await request("PATCH",`/products/${productA.id}`,{
        unit:"kg",packageKind:"bag",packageLabel:"Bolsa de prueba de 2,5 kg",
        unitsPerPackage:"2.5",packageCost:"0.10",expectedLossRate:"10"
      },tokenA);
      assert.equal(productUpdate.status,200);
      const created = await request("POST","/invoices",{
        contactId:contactA.id,series:"TEST_2026",issueDate:"2026-07-20",
        dueDate:"2026-07-21",applyContactDefaults:false
      },tokenA);
      assert.equal(created.status,201);
      let invoice=(await created.json()) as Entity;
      const line=await request("POST",`/invoices/${invoice.id}/lines`,{
        productId:productA.id,quantity:"5",packageQuantity:"2",unitPrice:"1.60"
      },tokenA);
      assert.equal(line.status,201);
      invoice=(await line.json()) as Entity;
      const lines=invoice.lines as Entity[];
      assert.equal(lines[0]?.packageQuantity,"2.0000");
      assert.equal(lines[0]?.unitsPerPackage,"2.5000");
      const issue=await request("POST",`/invoices/${invoice.id}/issue`,{},tokenA);
      assert.equal(issue.status,200);
      const first=await request("POST",`/invoices/${invoice.id}/payments`,{
        amount:"4.16",paidAt:"2026-07-21T12:00:00Z",method:"transfer"
      },tokenA);
      assert.equal(first.status,201);
      const detail=await request("GET",`/invoices/${invoice.id}`,undefined,tokenA);
      const paid=(await detail.json()) as Entity;
      assert.equal(paid.paymentStatus,"partial");
      assert.equal(paid.paidTotal,"4.16");
      const account=await request("GET",`/contacts/${contactA.id}/account`,undefined,tokenA);
      assert.equal(account.status,200);
      assert.equal((await account.json() as Entity).paidTotal,"4.16");
      assert.equal((await request("POST",`/invoices/${invoice.id}/payments`,{
        amount:"999",paidAt:"2026-07-21T12:00:00Z"
      },tokenA)).status,409);

      const roundedCreated = await request("POST","/invoices",{
        contactId:contactA.id,series:"ROUND_2026",issueDate:"2026-07-22",
        dueDate:"2026-07-22",applyContactDefaults:false
      },tokenA);
      assert.equal(roundedCreated.status,201);
      let roundedInvoice=(await roundedCreated.json()) as Entity;
      const roundedLine=await request("POST",`/invoices/${roundedInvoice.id}/lines`,{
        productId:productA.id,quantity:"1254.9",unitPrice:"1"
      },tokenA);
      assert.equal(roundedLine.status,201);
      roundedInvoice=(await roundedLine.json()) as Entity;
      assert.equal(roundedInvoice.total,"1305.0960");
      assert.equal((await request("POST",`/invoices/${roundedInvoice.id}/issue`,{},tokenA)).status,200);
      assert.equal((await request("POST",`/invoices/${roundedInvoice.id}/payments`,{
        amount:"1305.09",paidAt:"2026-07-22T12:00:00Z",method:"transfer"
      },tokenA)).status,201);
      const roundedDetail=await request("GET",`/invoices/${roundedInvoice.id}`,undefined,tokenA);
      const roundedPaid=(await roundedDetail.json()) as Entity;
      assert.equal(roundedPaid.paymentStatus,"paid");
      assert.equal(roundedPaid.balanceDue,"0");
      const roundedPaidList=await request("GET","/invoices?series=ROUND_2026&paymentStatus=paid",undefined,tokenA);
      assert.equal(roundedPaidList.status,200);
      const roundedPaidItems=((await roundedPaidList.json()) as {items:Entity[]}).items;
      assert.equal(roundedPaidItems.length,1);
      assert.equal(roundedPaidItems[0]?.id,roundedInvoice.id);
      assert.equal(roundedPaidItems[0]?.balanceDue,"0");
      const roundedAccount=await request("GET",`/contacts/${contactA.id}/account`,undefined,tokenA);
      assert.equal(roundedAccount.status,200);
      const roundedAccountInvoices=((await roundedAccount.json()) as Entity).invoices as Entity[];
      const roundedAccountInvoice=roundedAccountInvoices.find((candidate)=>candidate.id===roundedInvoice.id);
      assert.equal(roundedAccountInvoice?.paymentStatus,"paid");
      assert.equal(roundedAccountInvoice?.balanceDue,"0");
    },
  );

  await context.test(
    "producción descuenta materia prima, suma terminado y registra merma",
    async () => {
      const raw=await createProduct(tokenA,{name:"Patata bruta ficticia",sku:"RAW-PROD-1",salePrice:"1",estimatedCost:"0.5"});
      const finished=await createProduct(tokenA,{name:"Patata terminada ficticia",sku:"FIN-PROD-1",salePrice:"1.6",estimatedCost:"0.7",
        packageKind:"bag",packageLabel:"Bolsa 2,5 kg",unitsPerPackage:"2.5",packageCost:"0.1",expectedLossRate:"10"});
      const supplier=await createContact(tokenA,{type:"supplier",legalName:"Proveedor producción",taxId:"TEST-PROD-SUP"});
      const purchase=await request("POST","/purchases",{
        supplierId:supplier.id,documentId:null,supplierInvoiceNumber:"PROD-IN-1",issueDate:"2026-07-20",
        dueDate:null,category:"mercancia",notes:null,lines:[{productId:raw.id,description:"Materia prima",
          quantity:"10",unit:"kg",unitCost:"0.5",taxRate:"4"}]
      },tokenA);
      assert.equal(purchase.status,201);
      const purchaseId=((await purchase.json()) as Entity).id;
      assert.equal((await request("POST",`/purchases/${purchaseId}/confirm`,{},tokenA)).status,200);
      const run=await request("POST","/production-runs",{
        inputProductId:raw.id,outputProductId:finished.id,occurredOn:"2026-07-20",
        inputQuantity:"10",outputQuantity:"9",packageQuantity:"3.6",notes:"Producción ficticia"
      },tokenA);
      assert.equal(run.status,201);
      const stock=await request("GET","/stock",undefined,tokenA);
      const items=(await stock.json()) as Entity[];
      assert.equal(items.find((item)=>item.productId===raw.id)?.quantity,"0.0000");
      assert.equal(items.find((item)=>item.productId===finished.id)?.quantity,"9.0000");
      const runs=await request("GET","/production-runs",undefined,tokenA);
      assert.equal(((await runs.json()) as Entity[])[0]?.lossQuantity,"1.0000");
    },
  );

  await context.test(
    "confirma y cancela compras sin ambigüedad de tipos PostgreSQL",
    async () => {
      const supplier = await createContact(tokenA, {
        type: "supplier",
        legalName: "Proveedor de transiciones",
        taxId: "TEST-PURCHASE-001",
      });
      const createPurchase = async (suffix: string) => {
        const response = await request(
          "POST",
          "/purchases",
          {
            supplierId: supplier.id,
            documentId: null,
            supplierInvoiceNumber: `TEST-${suffix}`,
            issueDate: "2026-07-19",
            dueDate: null,
            category: "mercancia",
            notes: "Compra ficticia de integración",
            lines: [
              {
                productId: null,
                description: `Línea ${suffix}`,
                quantity: "1",
                unit: "kg",
                unitCost: "2.5",
                taxRate: "4",
              },
            ],
          },
          tokenA,
        );
        assert.equal(response.status, 201);
        return (await response.json()) as Entity;
      };

      const confirmed = await createPurchase("CONFIRM");
      const confirm = await request(
        "POST",
        `/purchases/${confirmed.id}/confirm`,
        {},
        tokenA,
      );
      assert.equal(confirm.status, 200);
      assert.equal(((await confirm.json()) as Entity).status, "confirmed");

      const cancelled = await createPurchase("CANCEL");
      const cancel = await request(
        "POST",
        `/purchases/${cancelled.id}/cancel`,
        {},
        tokenA,
      );
      assert.equal(cancel.status, 200);
      assert.equal(((await cancel.json()) as Entity).status, "cancelled");
    },
  );

  await context.test(
    "bajas son lógicas, auditadas y autenticación sigue activa",
    async () => {
      assert.equal(
        (await request("DELETE", `/contacts/${contactA.id}`, undefined, tokenA))
          .status,
        204,
      );
      assert.equal(
        (await request("DELETE", `/products/${productA.id}`, undefined, tokenA))
          .status,
        204,
      );
      assert.equal(
        (
          (await (
            await request("GET", `/contacts/${contactA.id}`, undefined, tokenA)
          ).json()) as Entity
        ).isActive,
        false,
      );
      assert.equal(
        (
          (await (
            await request("GET", `/products/${productA.id}`, undefined, tokenA)
          ).json()) as Entity
        ).isActive,
        false,
      );
      assert.equal(
        (await request("GET", "/me", undefined, tokenA)).status,
        200,
      );
      const actions = await adminDatabase.pool.query<{ action: string }>(
        "select action from audit_events where action like 'contact.%' or action like 'product.%' or action like 'contact_product_price.%'",
      );
      for (const action of [
        "contact.created",
        "contact.updated",
        "contact.deactivated",
        "product.created",
        "product.updated",
        "product.deactivated",
        "contact_product_price.created",
        "contact_product_price.updated",
        "contact_product_price.deactivated",
      ])
        assert.ok(
          actions.rows.some((row) => row.action === action),
          `Falta ${action}`,
        );
      assert.equal(
        (await apiDatabase.pool.query("select id from contacts")).rowCount,
        0,
      );
      assert.equal(
        (await apiDatabase.pool.query("select id from products")).rowCount,
        0,
      );
    },
  );
});
