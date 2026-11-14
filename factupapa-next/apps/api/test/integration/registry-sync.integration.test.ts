import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { bootstrapInitialAccount } from "../../src/auth/bootstrap.js";
import type { SessionIdentity } from "../../src/auth/repository.js";
import { createDatabaseProbe, type Database } from "../../src/database/client.js";
import { loadRegistrySyncTargets } from "../../src/finance/registry-auto-sync.js";
import { FinanceService } from "../../src/finance/service.js";

const databaseUrl = process.env.DATABASE_URL;
const adminUrl = process.env.DATABASE_ADMIN_URL;
let api: Database;
let admin: Database;
let owner: SessionIdentity;
let finance: FinanceService;
const realFetch = globalThis.fetch;

const header = "Fecha,Registro,Tipo,Doc,Número,Proveedor,NIF,Concepto,Categoría,Base,IVA %,IVA,Total,Pago";
function line(cells: Record<number, string>): string {
  const row = Array.from({ length: 22 }, () => "");
  for (const [index, value] of Object.entries(cells)) row[Number(index)] = value;
  return row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",");
}
const registry = [
  header,
  // 1) revisada y completa -> confirmada y pagada
  line({ 0: "2026-10-28", 1: "2026-10-30", 2: "compra", 4: "006/0002.619", 5: "FRUTAS Y PATATAS GAYCA, S.A.", 6: "A04037677", 7: "PATATAS AGRIA", 9: "90", 10: "4%", 11: "3,6", 12: "93,6", 13: "pagado", 18: "https://drive.google.com/file/d/AAA111/view", 20: "sí" }),
  // 2) sin revisar -> borrador
  line({ 0: "2026-10-26", 2: "compra", 4: "26F02369", 5: "HIGIENLAB 2020 S.L.", 6: "B42743211", 7: "ENVASES", 9: "52,25", 10: "21%", 11: "10,97", 12: "63,22", 13: "pendiente", 18: "https://drive.google.com/file/d/BBB222/view", 20: "no" }),
  // 3) datos dudosos del lector («EMITIDA» / «Original») -> borrador aunque esté marcada «sí»
  line({ 0: "2026-11-11", 2: "compra", 4: "EMITIDA", 5: "Original", 6: "D00180031", 7: "ENVASES", 9: "66,39", 10: "21%", 11: "13,94", 12: "80,33", 13: "pagado", 18: "https://drive.google.com/file/d/CCC333/view", 20: "sí" }),
  // 4) exportada por la propia app -> se ignora
  line({ 0: "2026-04-01", 2: "Compra", 4: "FV006-00000709", 5: "FRUTAS Y PATATAS GAYCA, S.A.", 6: "A04037677", 9: "105,00 €", 11: "4,20 €", 12: "109,20 €", 20: "Generado automáticamente desde FactuPapa Next" }),
  // 5) incompleta (falta el total) -> se avisa
  line({ 0: "2026-11-04", 2: "compra", 4: "02/060891", 5: "PATATAS SALCEDO, S. L.", 6: "A6304007A", 9: "100,96", 11: "4", 12: "", 20: "no" }),
  // venta: no es una compra
  line({ 0: "2026-10-21", 2: "Venta", 4: "FAC-168/2026", 5: "INVERSIONES ROYAL FOOD S.L.U.", 9: "196,845", 11: "7,8738", 12: "204,7188" }),
].join("\n");

before(async () => {
  assert.ok(databaseUrl && adminUrl);
  admin = createDatabaseProbe(adminUrl);
  api = createDatabaseProbe(databaseUrl);
  await admin.pool.query("truncate table audit_events, users, companies cascade");
  await bootstrapInitialAccount(admin.pool, { companyName: "Empresa registro", email: "registry-owner@example.test", displayName: "Titular", password: "registry-integration-password" });
  const row = await admin.pool.query<{ companyId: string; userId: string }>(
    `select m.company_id "companyId", m.user_id "userId" from memberships m join users u on u.id=m.user_id where u.email='registry-owner@example.test'`,
  );
  owner = { ...row.rows[0]!, familyId: "00000000-0000-4000-8000-0000000000ee", email: "registry-owner@example.test", displayName: "Titular", companyName: "Empresa registro", role: "owner" };
  finance = new FinanceService(api.pool, undefined, undefined, { url: "https://registry.example.test/export.csv" });
  globalThis.fetch = (async () => new Response(registry, { status: 200, headers: { "content-type": "text/csv" } })) as typeof fetch;
});

after(async () => {
  globalThis.fetch = realFetch;
  await api.pool.end();
  await admin.pool.end();
});

test("el servidor encuentra a qué empresa y con qué propietario importar", async () => {
  const targets = await loadRegistrySyncTargets(api.pool);
  assert.equal(targets.length, 1);
  assert.equal(targets[0]!.companyId, owner.companyId);
  assert.equal(targets[0]!.userId, owner.userId);
});

test("importa confirmadas, borradores y dudosas; ignora lo exportado por la app y avisa de las incompletas", async () => {
  const result = await finance.syncPurchaseRegistry(owner);
  assert.equal(result.fetched, 5, "5 compras en el registro");
  assert.equal(result.imported, 3);
  assert.equal(result.drafts, 2, "la sin revisar y la dudosa quedan en borrador");
  assert.equal(result.paid, 1);
  assert.equal(result.skipped, 2, "la exportada por la app y la incompleta");
  assert.deepEqual(result.incomplete, [{ invoice: "02/060891", supplier: "PATATAS SALCEDO, S. L." }]);
  const rows = await admin.pool.query<{ n: string; status: string; notes: string }>(
    "select supplier_invoice_number n, status, notes from purchase_invoices order by supplier_invoice_number",
  );
  const byNumber = new Map(rows.rows.map((r) => [r.n, r]));
  assert.equal(byNumber.get("006/0002.619")?.status, "confirmed");
  assert.equal(byNumber.get("26F02369")?.status, "draft");
  assert.equal(byNumber.get("EMITIDA")?.status, "draft");
  assert.match(byNumber.get("EMITIDA")!.notes, /Revisar/);
  assert.equal(byNumber.has("FV006-00000709"), false);
});

test("una segunda importación no duplica nada", async () => {
  const again = await finance.syncPurchaseRegistry(owner);
  assert.equal(again.imported, 0);
  assert.equal(again.drafts, 0);
  const count = await admin.pool.query<{ n: number }>("select count(*)::int n from purchase_invoices");
  assert.equal(count.rows[0]!.n, 3);
});

test("el estado recuerda el resultado de la última importación automática", async () => {
  assert.equal(finance.purchaseRegistryStatus().lastAutoSync, null);
  finance.recordAutoSync({ fetched: 5, imported: 3, skipped: 2, drafts: 2, paid: 1, incomplete: [{ invoice: "x", supplier: "y" }] });
  const status = finance.purchaseRegistryStatus();
  assert.equal(status.configured, true);
  assert.equal(status.lastAutoSync?.ok, true);
  assert.equal(status.lastAutoSync?.imported, 3);
  assert.equal(status.lastAutoSync?.incomplete, 1);
  finance.recordAutoSync({ error: "hoja no disponible" });
  assert.equal(finance.purchaseRegistryStatus().lastAutoSync?.ok, false);
});
