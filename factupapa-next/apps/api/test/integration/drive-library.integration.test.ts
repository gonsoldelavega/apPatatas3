import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { bootstrapInitialAccount } from "../../src/auth/bootstrap.js";
import type { SessionIdentity } from "../../src/auth/repository.js";
import { createDatabaseProbe, type Database } from "../../src/database/client.js";
import { DRIVE_READ_SCOPE, DriveLibraryService } from "../../src/drive/library.js";

const databaseUrl = process.env.DATABASE_URL;
const adminUrl = process.env.DATABASE_ADMIN_URL;
let api: Database;
let admin: Database;
let owner: SessionIdentity;

// Árbol simulado de Drive: carpeta -> hijos.
type Node = { id: string; name: string; mimeType: string; size?: string; webViewLink?: string };
const folder = (id: string, name: string): Node => ({ id, name, mimeType: "application/vnd.google-apps.folder" });
const pdf = (id: string, name: string): Node => ({ id, name, mimeType: "application/pdf", size: "1234", webViewLink: `https://drive.google.com/file/d/${id}/view` });
const tree: Record<string, Node[]> = {
  ROOT: [folder("F_COMPRAS", "02_COMPRAS"), folder("F_VENTAS", "01_VENTAS"), folder("F_PEND", "99_PENDIENTE_DE_CLASIFICAR")],
  F_COMPRAS: [folder("F_OCT", "10_OCTUBRE")],
  F_OCT: [
    pdf("DRIVE_1", "2026-10-28_FACTURA_COMPRA_GAYCA_006_0002.619_93,60.pdf"),
    pdf("DRIVE_2", "2026-10-30_FACTURA_COMPRA_HETZNER_083001189226_5,43.pdf"),
  ],
  F_VENTAS: [pdf("DRIVE_3", "2026-10-21_FACTURA_VENTA_ROYAL_FAC-168_204,72.pdf")],
  F_PEND: [folder("F_REV", "REVISAR_MANUALMENTE")],
  F_REV: [pdf("DRIVE_4", "foto-sin-clasificar.jpg"), folder("F_DUP", "DUPLICADOS")],
  F_DUP: [pdf("DRIVE_5", "2026-10-28_FACTURA_COMPRA_GAYCA_006_0002.619_93,60.pdf")],
};
let scopes = [DRIVE_READ_SCOPE];
const fakeFetch = (async (input: URL | string) => {
  const url = new URL(String(input));
  const parent = /'([^']+)' in parents/.exec(url.searchParams.get("q") ?? "")?.[1] ?? "";
  return new Response(JSON.stringify({ files: tree[parent] ?? [] }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

let drive: DriveLibraryService;

before(async () => {
  assert.ok(databaseUrl && adminUrl);
  admin = createDatabaseProbe(adminUrl);
  api = createDatabaseProbe(databaseUrl);
  await admin.pool.query("truncate table audit_events, users, companies cascade");
  await bootstrapInitialAccount(admin.pool, { companyName: "Empresa Drive", email: "drive-owner@example.test", displayName: "Titular", password: "drive-integration-password" });
  const row = await admin.pool.query<{ companyId: string; userId: string }>(
    `select m.company_id "companyId", m.user_id "userId" from memberships m join users u on u.id=m.user_id where u.email='drive-owner@example.test'`,
  );
  owner = { ...row.rows[0]!, familyId: "00000000-0000-4000-8000-0000000000ff", email: "drive-owner@example.test", displayName: "Titular", companyName: "Empresa Drive", role: "owner" };
  drive = new DriveLibraryService(api.pool, { access: async () => ({ token: "t", scopes }), fetchImpl: fakeFetch, rootFolderId: "ROOT" });
  // Una compra ya registrada en la app: GAYCA del 28/10 por 93,60.
  await admin.pool.query(
    `insert into contacts(company_id,kind,legal_name,tax_id,address) values($1,'supplier','FRUTAS Y PATATAS GAYCA, S.A.','A04037677','{}')`,
    [owner.companyId],
  );
  await admin.pool.query(
    `insert into purchase_invoices(company_id,supplier_id,supplier_legal_name,supplier_tax_id,supplier_tax_identity_key,supplier_address,supplier_invoice_number,supplier_invoice_number_key,issue_date,category,subtotal,tax_total,total,created_by_user_id)
     select $1, c.id, c.legal_name, c.tax_id, 'A04037677', '{}', '006/0002.619', '0060002619', '2026-10-28', 'mercancia', 90, 3.6, 93.6, $2 from contacts c where c.company_id=$1`,
    [owner.companyId, owner.userId],
  );
});

after(async () => {
  await api.pool.end();
  await admin.pool.end();
});

test("sin permiso de lectura de Drive no se sincroniza y el estado lo indica", async () => {
  scopes = [];
  assert.equal((await drive.status(owner)).needsPermission, true);
  await assert.rejects(() => drive.sync(owner));
  scopes = [DRIVE_READ_SCOPE];
  assert.equal((await drive.status(owner)).needsPermission, false);
});

test("lee todo el árbol de Drive con su ruta y dice qué está registrado", async () => {
  assert.equal(await drive.sync(owner), 5);
  const state = await drive.status(owner);
  assert.equal(state.lastStatus, "ok");
  assert.equal(state.lastFileCount, 5);

  const all = await drive.list(owner, {});
  assert.equal(all.total, 5);
  const byId = new Map(all.items.map((item) => [item.driveId, item]));
  assert.equal(byId.get("DRIVE_1")?.path, "02_COMPRAS/10_OCTUBRE");
  assert.equal(byId.get("DRIVE_1")?.status, "registrada", "misma fecha e importe que una compra de la app");
  assert.equal(byId.get("DRIVE_2")?.status, "sin_registrar", "Hetzner no está en la app");
  assert.equal(byId.get("DRIVE_2")?.total, "5.43");
  assert.equal(byId.get("DRIVE_3")?.kind, "venta");
  assert.equal(byId.get("DRIVE_3")?.status, "no_aplica");
  assert.equal(byId.get("DRIVE_4")?.status, "revisar");
  assert.equal(byId.get("DRIVE_5")?.status, "duplicado");

  const pending = await drive.list(owner, { kind: "compra", status: "sin_registrar" });
  assert.deepEqual(pending.items.map((item) => item.driveId), ["DRIVE_2"]);
  assert.equal((await drive.list(owner, { month: "2026-10" })).total, 4, "D4 no tiene fecha en el nombre ni en Drive");
  assert.deepEqual((await drive.list(owner, { search: "hetzner" })).items.map((item) => item.driveId), ["DRIVE_2"]);
});

test("lo que desaparece de Drive deja de aparecer y las empresas no se ven entre sí", async () => {
  tree.F_OCT = [pdf("DRIVE_1", "2026-10-28_FACTURA_COMPRA_GAYCA_006_0002.619_93,60.pdf")];
  assert.equal(await drive.sync(owner), 4);
  assert.equal((await drive.list(owner, {})).items.some((item) => item.driveId === "DRIVE_2"), false);
  const other = await admin.pool.query("select count(*)::int n from drive_files where company_id <> $1", [owner.companyId]);
  assert.equal(other.rows[0].n, 0);
});
