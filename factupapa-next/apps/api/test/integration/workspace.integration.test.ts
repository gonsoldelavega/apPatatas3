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
import { LedgerService } from "../../src/workspace/ledger.js";
import { NotesService } from "../../src/workspace/notes.js";
import { NoteAttachmentsService, type AttachmentStore } from "../../src/workspace/attachments.js";
import { OrdersService } from "../../src/workspace/orders.js";
import { createWorkspaceRoutes } from "../../src/workspace/routes.js";
import { TasksService } from "../../src/workspace/tasks.js";

const databaseUrl = process.env.DATABASE_URL;
const adminUrl = process.env.DATABASE_ADMIN_URL;
const memoryFiles = new Map<string, { body: Buffer; mimeType: string }>();
const memoryStore: AttachmentStore = {
  async put(key, body, mimeType) { memoryFiles.set(key, { body, mimeType }); },
  async get(key) { const file = memoryFiles.get(key); if (!file) throw new Error("missing"); return file.body; },
  async delete(key) { memoryFiles.delete(key); },
};
let api: Database;
let admin: Database;
let server: Server;
let baseUrl = "";
let ownerToken = "";
let partnerToken = "";
let otherToken = "";
let customerId = "";
let productId = "";

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
const read = async <T = any>(response: Response): Promise<T> => (await response.json()) as T;

before(async () => {
  assert.ok(databaseUrl && adminUrl);
  admin = createDatabaseProbe(adminUrl);
  api = createDatabaseProbe(databaseUrl);
  await admin.pool.query("truncate table audit_events, users, companies cascade");
  await bootstrapInitialAccount(admin.pool, {
    companyName: "Espacio A",
    email: "ws-owner@example.test",
    displayName: "Irene Maestra",
    password: "ws-integration-password-a",
  });
  const hash = await hashPassword("ws-integration-password-b");
  await admin.pool.query(
    `with c as (insert into companies(name) values ('Espacio B') returning id),
          u as (insert into users(email, display_name, password_hash) values ('ws-other@example.test','Otra Empresa',$1) returning id)
     insert into memberships(company_id, user_id, role) select c.id, u.id, 'owner' from c cross join u`,
    [hash],
  );
  const auth = await AuthService.create({
    repository: new AuthRepository(api.pool),
    jwtSecret: "workspace-integration-jwt-secret-at-least-32",
    accessTokenTtlSeconds: 900,
    refreshTokenTtlDays: 30,
    loginRateLimitMax: 50,
    loginRateLimitWindowMs: 60_000,
  });
  const row = await admin.pool.query<{ companyId: string; userId: string }>(
    `select m.company_id "companyId", m.user_id "userId" from memberships m join users u on u.id=m.user_id where u.email='ws-owner@example.test'`,
  );
  const owner: SessionIdentity = {
    ...row.rows[0]!,
    familyId: "00000000-0000-4000-8000-0000000000cc",
    email: "ws-owner@example.test",
    displayName: "Irene Maestra",
    companyName: "Espacio A",
    role: "owner",
  };
  ({ customerId, productId } = await withTenantTransaction(api.pool, owner, async (client) => {
    const c = await client.query<{ id: string }>(
      `insert into contacts(company_id,kind,legal_name,trade_name,tax_id,address) values($1,'customer','Bar Royal SL','Bar Royal','TEST-WS-C','{}') returning id`,
      [owner.companyId],
    );
    const p = await client.query<{ id: string }>(
      `insert into products(company_id,name,sku,unit,sale_price,tax_rate) values($1,'Patata agria','TEST-WS-P','kg',1.45,4) returning id`,
      [owner.companyId],
    );
    return { customerId: c.rows[0]!.id, productId: p.rows[0]!.id };
  }));
  await admin.pool.query("select * from team_add_partner($1,$2,$3)", [owner.companyId, owner.userId, "ws-socio@example.test"]);

  server = createApp({
    database: api,
    auth,
    version: "workspace-integration",
    corsAllowedOrigins: ["http://integration.test"],
    documents: createDocumentLookup(api.pool),
    routes: [
      createWorkspaceRoutes(auth, {
        notes: new NotesService(api.pool),
        attachments: new NoteAttachmentsService(api.pool, memoryStore),
        tasks: new TasksService(api.pool),
        orders: new OrdersService(api.pool),
        ledger: new LedgerService(api.pool),
      }),
    ],
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  ownerToken = (await auth.googleLogin("ws-owner@example.test", "Irene Maestra")).accessToken;
  partnerToken = (await auth.googleLogin("ws-socio@example.test", "Gemma Socia")).accessToken;
  otherToken = (await auth.googleLogin("ws-other@example.test", "Otra Empresa")).accessToken;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await api.pool.end();
  await admin.pool.end();
});

// ── Pedidos ─────────────────────────────────────────────────────────────────────
let orderId = "";
let kgLine = "";
let bagLine = "";

test("pedido para un bar con 125 kg y 50 bolsas, creado por un socio", async () => {
  const response = await call("POST", "/orders", partnerToken, {
    contactId: customerId,
    dueDate: "2026-11-10",
    notes: "Entregar por la mañana",
    lines: [
      { productId, unit: "kg", quantity: "125" },
      { description: "Patata pelada 2,5 kg", unit: "bolsa", quantity: "50" },
    ],
  });
  assert.equal(response.status, 201);
  const order = await read(response);
  orderId = order.id;
  assert.equal(order.status, "open");
  assert.equal(order.contactName, "Bar Royal");
  assert.equal(order.createdByName, "Gemma Socia");
  assert.equal(order.lines.length, 2);
  assert.equal(order.lines[0].description, "Patata agria", "sin descripción se usa el nombre del producto");
  kgLine = order.lines[0].id;
  bagLine = order.lines[1].id;
  assert.equal(order.lines[1].quantityPending, "50");
});

test("al terminar el día: se han hecho 38 bolsas y quedan 12 pendientes", async () => {
  const response = await call("POST", `/orders/${orderId}/lines/${bagLine}/progress`, ownerToken, { delta: "38" });
  assert.equal(response.status, 200);
  const order = await read(response);
  const bags = order.lines.find((line: any) => line.id === bagLine);
  assert.equal(bags.quantityOrdered, "50");
  assert.equal(bags.quantityDone, "38");
  assert.equal(bags.quantityPending, "12");
  assert.equal(order.status, "open");
  assert.equal(order.history[0].createdByName, "Irene Maestra");
  assert.equal(order.history[0].delta, "38");
});

test("el pedido se completa solo cuando todas las líneas están hechas; una corrección lo reabre", async () => {
  await call("POST", `/orders/${orderId}/lines/${bagLine}/progress`, partnerToken, { delta: "12" });
  let order = await read(await call("GET", `/orders/${orderId}`, partnerToken));
  assert.equal(order.status, "open", "falta la línea de kg");
  order = await read(await call("POST", `/orders/${orderId}/lines/${kgLine}/progress`, partnerToken, { done: "125" }));
  assert.equal(order.status, "completed");
  assert.ok(order.completedAt);
  const reopened = await read(await call("POST", `/orders/${orderId}/lines/${kgLine}/progress`, ownerToken, { delta: "-5" }));
  assert.equal(reopened.status, "open");
  assert.equal(reopened.lines.find((line: any) => line.id === kgLine).quantityPending, "5");
  const finished = await read(await call("POST", `/orders/${orderId}/lines/${kgLine}/progress`, ownerToken, { delta: "5" }));
  assert.equal(finished.status, "completed");
});

test("no se puede pasar de lo pedido ni bajar de cero, y los datos inválidos dan 400", async () => {
  const fresh = await read(
    await call("POST", "/orders", ownerToken, { contactId: customerId, lines: [{ description: "Patata", unit: "kg", quantity: "10" }] }),
  );
  const line = fresh.lines[0].id;
  assert.equal((await call("POST", `/orders/${fresh.id}/lines/${line}/progress`, ownerToken, { delta: "10.5" })).status, 400);
  assert.equal((await call("POST", `/orders/${fresh.id}/lines/${line}/progress`, ownerToken, { delta: "-1" })).status, 400);
  assert.equal((await call("POST", `/orders/${fresh.id}/lines/${line}/progress`, ownerToken, { delta: "1", done: "1" })).status, 400);
  assert.equal((await call("POST", `/orders/${fresh.id}/lines/${line}/progress`, ownerToken, {})).status, 400);
  assert.equal((await call("POST", "/orders", ownerToken, { contactId: customerId, lines: [] })).status, 400);
  assert.equal((await call("POST", "/orders", ownerToken, { contactId: customerId, lines: [{ description: "x", unit: "toneladas", quantity: "1" }] })).status, 400);
  assert.equal((await call("POST", "/orders", ownerToken, { contactId: customerId, lines: [{ description: "x", unit: "kg", quantity: "0" }] })).status, 400);
  // Decimales con coma
  const withComma = await call("POST", `/orders/${fresh.id}/lines/${line}/progress`, ownerToken, { delta: "2,5" });
  assert.equal(withComma.status, 200);
  assert.equal((await read(withComma)).lines[0].quantityDone, "2.5");
  // Cancelar: ya no admite avances
  assert.equal((await call("POST", `/orders/${fresh.id}/cancel`, partnerToken)).status, 200);
  assert.equal((await call("POST", `/orders/${fresh.id}/lines/${line}/progress`, ownerToken, { delta: "1" })).status, 409);
});

test("la lista de pendientes solo trae pedidos abiertos y se puede filtrar", async () => {
  const open = await read(await call("GET", "/orders?status=open", partnerToken));
  assert.ok(open.items.every((item: any) => item.status === "open"));
  const all = await read(await call("GET", "/orders?status=all", partnerToken));
  assert.ok(all.items.length > open.items.length);
  assert.equal((await call("GET", "/orders?status=cualquiera", partnerToken)).status, 400);
});

test("reparto del día: pedidos de hoy y atrasados con teléfono y dirección del cliente", async () => {
  await admin.pool.query(`update contacts set phone = '600 11 22 33', address = '{"street":"Calle Mayor 1","city":"Roquetas"}'::jsonb where id = $1`, [customerId]);
  await admin.pool.query(`insert into contact_people(company_id, contact_id, name, role, phone) select company_id, id, 'Manolo', 'Dueño', '611223344' from contacts where id = $1`, [customerId]);
  const future = await call("POST", "/orders", partnerToken, { contactId: customerId, dueDate: "2026-12-31", lines: [{ description: "Patata para después", unit: "kg", quantity: "10" }] });
  assert.equal(future.status, 201);
  const todayOrder = await read(await call("POST", "/orders", partnerToken, { contactId: customerId, dueDate: "2026-11-10", lines: [{ description: "Patata de hoy", unit: "bolsa", quantity: "20" }] }));
  const lateOrder = await read(await call("POST", "/orders", partnerToken, { contactId: customerId, dueDate: "2026-11-08", lines: [{ description: "Patata atrasada", unit: "kg", quantity: "5" }] }));
  const day = await read(await call("GET", "/orders/delivery-day?date=2026-11-10", partnerToken));
  assert.deepEqual(day.items.map((item: any) => item.id).filter((id: string) => id === todayOrder.id || id === lateOrder.id), [lateOrder.id, todayOrder.id], "atrasados primero");
  assert.equal(day.date, "2026-11-10");
  assert.ok(day.items.length >= 1);
  assert.ok(day.items.every((item: any) => item.status === "open" && item.dueDate <= "2026-11-10"), "solo hoy y atrasados");
  assert.ok(!day.items.some((item: any) => item.dueDate === "2026-12-31"));
  const stop = day.items.find((item: any) => item.id === todayOrder.id);
  assert.equal(stop.contactPhone, "600 11 22 33");
  assert.equal(stop.contactAddress.street, "Calle Mayor 1");
  assert.equal(stop.people[0].name, "Manolo");
  assert.equal((await call("GET", "/orders/delivery-day?date=mañana", partnerToken)).status, 400);
});

// ── Tareas ──────────────────────────────────────────────────────────────────────
test("tareas: crear, asignar a un núcleo, marcar hecha, reabrir y borrar", async () => {
  const created = await call("POST", "/tasks", partnerToken, {
    title: "Llevar muestras a Bar Royal",
    contactId: customerId,
    assignedSide: "side_b",
    dueDate: "2026-11-08",
  });
  assert.equal(created.status, 201);
  const task = await read(created);
  assert.equal(task.contactName, "Bar Royal");
  assert.equal(task.done, false);
  let open = await read(await call("GET", "/tasks?status=open", ownerToken));
  assert.ok(open.items.some((item: any) => item.id === task.id), "el maestro ve la tarea del socio");
  const done = await read(await call("POST", `/tasks/${task.id}/done`, ownerToken));
  assert.equal(done.done, true);
  assert.equal(done.doneByName, "Irene Maestra");
  open = await read(await call("GET", "/tasks?status=open", ownerToken));
  assert.ok(!open.items.some((item: any) => item.id === task.id));
  const reopened = await read(await call("POST", `/tasks/${task.id}/reopen`, partnerToken));
  assert.equal(reopened.done, false);
  assert.equal((await call("PATCH", `/tasks/${task.id}`, partnerToken, { title: "Llevar muestras y tarifas" })).status, 200);
  assert.equal((await call("DELETE", `/tasks/${task.id}`, partnerToken)).status, 204);
  assert.equal((await call("DELETE", `/tasks/${task.id}`, partnerToken)).status, 404);
  assert.equal((await call("POST", "/tasks", partnerToken, { title: "x", assignedSide: "nadie" })).status, 400);
});

// ── Notas ───────────────────────────────────────────────────────────────────────
test("notas comunes por cliente: crear, buscar, fijar, editar y archivar", async () => {
  const created = await call("POST", "/notes", partnerToken, {
    contactId: customerId,
    title: "Qué quiere Bar Royal",
    body: "El dueño se llama Paco. Gasta patata agria pelada, 2 veces por semana.",
  });
  assert.equal(created.status, 201);
  const note = await read(created);
  assert.equal(note.contactName, "Bar Royal");
  assert.equal(note.createdByName, "Gemma Socia");
  await call("POST", "/notes", ownerToken, { title: "Otra nota", body: "sin cliente" });
  const found = await read(await call("GET", "/notes?search=paco", ownerToken));
  assert.deepEqual(found.items.map((item: any) => item.id), [note.id], "se busca dentro del texto");
  const byCustomer = await read(await call("GET", `/notes?contactId=${customerId}`, ownerToken));
  assert.equal(byCustomer.items.length, 1);
  const edited = await read(await call("PATCH", `/notes/${note.id}`, ownerToken, { pinned: true, body: "El dueño se llama Paco y paga a 30 días" }));
  assert.equal(edited.pinned, true);
  assert.equal(edited.updatedByName, "Irene Maestra");
  const list = await read(await call("GET", "/notes", partnerToken));
  assert.equal(list.items[0].id, note.id, "las fijadas salen primero");
  assert.equal((await call("DELETE", `/notes/${note.id}`, partnerToken)).status, 204);
  assert.equal((await call("GET", `/notes?contactId=${customerId}`, ownerToken).then(read)).items.length, 0);
});

// ── Notas con fotos y voz ───────────────────────────────────────────────────────
test("notas con foto y nota de voz: se suben, se leen y se borran; se rechaza lo que no es lo que dice ser", async () => {
  const note = await read(await call("POST", "/notes", partnerToken, { contactId: customerId, title: "Carta de Bar Royal" }));
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
  const photo = await call("POST", `/notes/${note.id}/attachments`, partnerToken, { kind: "image", mimeType: "image/jpeg", data: jpeg.toString("base64") });
  assert.equal(photo.status, 201);
  const saved = await read(photo);
  assert.equal(saved.kind, "image");
  assert.equal(saved.byteSize, jpeg.length);
  const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64, 2)]);
  const voice = await call("POST", `/notes/${note.id}/attachments`, ownerToken, { kind: "audio", mimeType: "audio/webm;codecs=opus", data: webm.toString("base64"), durationSeconds: 42 });
  assert.equal(voice.status, 201);
  assert.equal((await read(voice)).mimeType, "audio/webm");
  // La lista de notas ya trae los adjuntos.
  const listed = await read(await call("GET", `/notes?contactId=${customerId}`, partnerToken));
  const withFiles = listed.items.find((item: any) => item.id === note.id);
  assert.deepEqual(withFiles.attachments.map((item: any) => item.kind), ["image", "audio"]);
  assert.equal(withFiles.attachments[1].durationSeconds, 42);
  // Contenido: el mismo que se subió, con su tipo.
  const download = await call("GET", `/notes/${note.id}/attachments/${saved.id}`, ownerToken);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), jpeg);
  // Rechazos: contenido que no coincide, tipo no permitido, base64 inválido, clave desconocida.
  assert.equal((await call("POST", `/notes/${note.id}/attachments`, partnerToken, { kind: "image", mimeType: "image/jpeg", data: Buffer.from("<script>alert(1)</script>").toString("base64") })).status, 400);
  assert.equal((await call("POST", `/notes/${note.id}/attachments`, partnerToken, { kind: "image", mimeType: "image/svg+xml", data: jpeg.toString("base64") })).status, 400);
  assert.equal((await call("POST", `/notes/${note.id}/attachments`, partnerToken, { kind: "audio", mimeType: "audio/webm", data: "no es base64!" })).status, 400);
  assert.equal((await call("POST", `/notes/${note.id}/attachments`, partnerToken, { kind: "image", mimeType: "image/jpeg", data: jpeg.toString("base64"), extra: 1 })).status, 400);
  assert.equal((await call("POST", "/notes/3f2b8c1e-5d4a-4b7e-9c11-0a1b2c3d4e5f/attachments", partnerToken, { kind: "image", mimeType: "image/jpeg", data: jpeg.toString("base64") })).status, 404);
  // Borrar.
  assert.equal((await call("DELETE", `/notes/${note.id}/attachments/${saved.id}`, partnerToken)).status, 204);
  assert.equal((await call("GET", `/notes/${note.id}/attachments/${saved.id}`, partnerToken)).status, 404);
  assert.equal(memoryFiles.size, 1, "el archivo borrado también sale del almacén");
});

// ── Cuentas entre núcleos ───────────────────────────────────────────────────────
test("cuentas: ellos pagan 35 € de material y nosotros 500 € del local → ellos deben 232,50 €", async () => {
  const theirs = await call("POST", "/ledger/entries", partnerToken, { kind: "expense", side: "side_b", amount: "35", concept: "Material para el negocio", entryDate: "2026-11-03" });
  assert.equal(theirs.status, 201);
  const ours = await call("POST", "/ledger/entries", ownerToken, { kind: "expense", side: "side_a", amount: "500", concept: "Local", entryDate: "2026-11-01" });
  assert.equal(ours.status, 201);
  const summary = await read(await call("GET", "/ledger/summary", partnerToken));
  assert.equal(summary.balance.debtorSide, "side_b");
  assert.equal(summary.balance.debtorName, "Roberto y Gemma");
  assert.equal(summary.balance.creditorName, "Irene y Nando");
  assert.equal(summary.balance.amount, "232.50");
  assert.equal(summary.totals.side_a.expenses, "500.00");
  assert.equal(summary.totals.side_b.expenses, "35.00");
  assert.equal(summary.result.expenses, "535.00");
});

test("los ingresos también se reparten al 50 %", async () => {
  // Nuestro núcleo cobra 200 €: debemos la mitad (100 €) al otro. 232,50 − 100 = 132,50.
  await call("POST", "/ledger/entries", ownerToken, { kind: "income", side: "side_a", amount: "200", concept: "Cobro de un bar" });
  const summary = await read(await call("GET", "/ledger/summary", ownerToken));
  assert.equal(summary.balance.debtorSide, "side_b");
  assert.equal(summary.balance.amount, "132.50");
  assert.equal(summary.result.income, "200.00");
  assert.equal(summary.result.net, "-335.00");
});

test("permisos: cada uno borra lo suyo; el maestro, todo; el socio ve todos los apuntes", async () => {
  const entries = await read(await call("GET", "/ledger/entries", partnerToken));
  assert.equal(entries.items.length, 3);
  const mine = entries.items.find((item: any) => item.concept === "Material para el negocio");
  const owners = entries.items.find((item: any) => item.concept === "Local");
  assert.equal(mine.canEdit, true);
  assert.equal(owners.canEdit, false);
  assert.equal((await call("PATCH", `/ledger/entries/${owners.id}`, partnerToken, { amount: "1" })).status, 403);
  assert.equal((await call("DELETE", `/ledger/entries/${owners.id}`, partnerToken)).status, 403);
  assert.equal((await call("PATCH", `/ledger/entries/${mine.id}`, partnerToken, { amount: "45" })).status, 200);
  const summary = await read(await call("GET", "/ledger/summary", ownerToken));
  assert.equal(summary.totals.side_b.expenses, "45.00");
  assert.equal(summary.balance.amount, "127.50", "(500 − 45 − 200) / 2");
  // El maestro puede corregir cualquier apunte.
  assert.equal((await call("PATCH", `/ledger/entries/${mine.id}`, ownerToken, { amount: "35" })).status, 200);
});

test("filtro por periodo: el balance es acumulado, los totales son del periodo", async () => {
  const summary = await read(await call("GET", "/ledger/summary?from=2026-11-02&to=2026-11-30", ownerToken));
  assert.equal(summary.balance.amount, "132.50", "el balance siempre es acumulado");
  assert.equal(summary.totals.side_a.expenses, "0.00", "el local (1 nov) queda fuera del periodo");
  assert.equal(summary.totals.side_b.expenses, "35.00");
  assert.equal((await call("GET", "/ledger/summary?from=2026-13-40", ownerToken)).status, 400);
});

test("saldar cuentas deja el balance a cero y no se puede saldar dos veces", async () => {
  const settled = await call("POST", "/ledger/settle", partnerToken, {});
  assert.equal(settled.status, 201);
  const entry = await read(settled);
  assert.equal(entry.kind, "settlement");
  assert.equal(entry.side, "side_b", "paga el núcleo deudor");
  assert.equal(entry.amount, "132.50");
  const summary = await read(await call("GET", "/ledger/summary", ownerToken));
  assert.equal(summary.balance.debtorSide, null);
  assert.equal(summary.balance.amount, "0.00");
  assert.equal((await call("POST", "/ledger/settle", ownerToken, {})).status, 409);
});

test("un apunte borrado deja de contar", async () => {
  const entries = await read(await call("GET", "/ledger/entries", ownerToken));
  const income = entries.items.find((item: any) => item.kind === "income");
  assert.equal((await call("DELETE", `/ledger/entries/${income.id}`, ownerToken)).status, 204);
  const summary = await read(await call("GET", "/ledger/summary", ownerToken));
  // Sin el ingreso de 200 €: (500 − 35)/2 = 232,50 menos la liquidación de 132,50 = 100,00 que aún deben.
  assert.equal(summary.balance.debtorSide, "side_b");
  assert.equal(summary.balance.amount, "100.00");
});

test("solo el maestro cambia los nombres de los núcleos", async () => {
  assert.equal((await call("PUT", "/ledger/settings", partnerToken, { sideAName: "X", sideBName: "Y" })).status, 403);
  const saved = await call("PUT", "/ledger/settings", ownerToken, { sideAName: "Núcleo Uno", sideBName: "Núcleo Dos" });
  assert.equal(saved.status, 200);
  const summary = await read(await call("GET", "/ledger/summary", partnerToken));
  assert.equal(summary.sideNames.side_a, "Núcleo Uno");
  assert.equal(summary.balance.debtorName, "Núcleo Dos");
});

test("validación de apuntes", async () => {
  for (const body of [
    { kind: "expense", side: "side_a", amount: "0", concept: "x" },
    { kind: "expense", side: "side_a", amount: "-5", concept: "x" },
    { kind: "expense", side: "side_c", amount: "5", concept: "x" },
    { kind: "regalo", side: "side_a", amount: "5", concept: "x" },
    { kind: "expense", side: "side_a", amount: "5", concept: "" },
    { kind: "expense", side: "side_a", amount: "5.123", concept: "x" },
  ]) {
    assert.equal((await call("POST", "/ledger/entries", ownerToken, body)).status, 400, JSON.stringify(body));
  }
});

// ── Aislamiento ─────────────────────────────────────────────────────────────────
test("otra empresa no ve nada de este espacio", async () => {
  for (const path of ["/orders?status=all", "/tasks?status=all", "/notes", "/ledger/entries"]) {
    const body = await read(await call("GET", path, otherToken));
    assert.deepEqual(body.items, [], path);
  }
  const summary = await read(await call("GET", "/ledger/summary", otherToken));
  assert.equal(summary.balance.amount, "0.00");
  assert.equal((await call("GET", `/orders/${orderId}`, otherToken)).status, 404);
});

test("sin sesión no hay acceso", async () => {
  for (const path of ["/orders", "/tasks", "/notes", "/ledger/summary"]) {
    assert.equal((await call("GET", path)).status, 401, path);
  }
});
