import { test } from "node:test";
import assert from "node:assert/strict";
import "../src/services/state-merge.js";

const M = globalThis.AppStateMerge;

const base = () => ({
  settings: { deviceId: "X", lastSavedAt: "", nextInvoiceNumber: 1 },
  _sync: { updatedAt: "" },
  templates: [], clients: [], suppliers: [], products: [], purchases: [],
  expenses: [], walletMovements: [], deliveryNotes: [], invoices: [], documents: [],
  _deleted: {}
});
const inv = (id, t) => ({ id, total: 1, updatedAt: t });

test("seed: local con datos, remoto vacío -> conserva lo local y hay que subir", () => {
  const local = base(); local.invoices = [inv("a", "2026-06-01T10:00:00Z")];
  local.settings.deviceId = "safari"; local._sync.updatedAt = "2026-06-01T10:00:00Z";
  const remote = base(); remote.settings.deviceId = "cloud";
  const m = M.mergeStates(local, remote);
  assert.equal(m.invoices.length, 1);
  assert.equal(m.settings.deviceId, "safari");
  assert.equal(M.statesEquivalent(m, remote), false);
});

test("adopción: local vacío, remoto con datos -> recibe y no necesita subir", () => {
  const local = base();
  const remote = base(); remote.invoices = [inv("a", "2026-06-01T10:00:00Z")];
  remote._sync.updatedAt = "2026-06-01T10:00:00Z";
  const m = M.mergeStates(local, remote);
  assert.equal(m.invoices.length, 1);
  assert.equal(M.statesEquivalent(m, remote), true);
});

test("unión: cada móvil con una factura distinta -> ambas", () => {
  const local = base(); local.invoices = [inv("b", "2026-06-02T10:00:00Z")];
  const remote = base(); remote.invoices = [inv("a", "2026-06-01T10:00:00Z")];
  const m = M.mergeStates(local, remote);
  assert.equal(m.invoices.length, 2);
});

test("borrado: tombstone remoto elimina la entidad vieja local", () => {
  const local = base(); local.invoices = [inv("a", "2026-06-01T10:00:00Z")];
  const remote = base(); remote._deleted = { "invoices:a": "2026-06-03T10:00:00Z" };
  const m = M.mergeStates(local, remote);
  assert.equal(m.invoices.length, 0);
});

test("borrado vencido por re-edición posterior se conserva", () => {
  const local = base(); local.invoices = [inv("a", "2026-06-04T10:00:00Z")];
  const remote = base(); remote._deleted = { "invoices:a": "2026-06-03T10:00:00Z" };
  const m = M.mergeStates(local, remote);
  assert.equal(m.invoices.length, 1);
});

test("conflicto: gana la edición con updatedAt más reciente", () => {
  const local = base(); local.invoices = [{ id: "a", total: 99, updatedAt: "2026-06-05T10:00:00Z" }];
  const remote = base(); remote.invoices = [{ id: "a", total: 11, updatedAt: "2026-06-04T10:00:00Z" }];
  const m = M.mergeStates(local, remote);
  assert.equal(m.invoices[0].total, 99);
});

test("nextInvoiceNumber es monótono: máximo de ambos lados", () => {
  const local = base(); local.settings.nextInvoiceNumber = 112;
  const remote = base(); remote.settings.nextInvoiceNumber = 120;
  assert.equal(M.mergeStates(local, remote).settings.nextInvoiceNumber, 120);
  assert.equal(M.mergeStates(remote, local).settings.nextInvoiceNumber, 120);
});

test("deviceId nunca se sobrescribe con el del otro equipo", () => {
  const local = base(); local.settings.deviceId = "telefono-1"; local._sync.updatedAt = "2026-06-01T00:00:00Z";
  const remote = base(); remote.settings.deviceId = "telefono-2"; remote._sync.updatedAt = "2026-06-09T00:00:00Z";
  assert.equal(M.mergeStates(local, remote).settings.deviceId, "telefono-1");
});

test("tombstones muy antiguos (>180 días) se podan", () => {
  const old = new Date(Date.now() - 1000 * 60 * 60 * 24 * 200).toISOString();
  const recent = new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString();
  const local = base(); local._deleted = { "invoices:old": old, "invoices:recent": recent };
  const remote = base();
  const m = M.mergeStates(local, remote);
  assert.equal(m._deleted["invoices:old"], undefined);
  assert.ok(m._deleted["invoices:recent"]);
});

test("idempotencia de la fusión", () => {
  const local = base(); local.invoices = [inv("b", "2026-06-02T10:00:00Z")];
  const remote = base(); remote.invoices = [inv("a", "2026-06-01T10:00:00Z")];
  const once = M.mergeStates(local, remote);
  const twice = M.mergeStates(once, remote);
  assert.equal(M.statesEquivalent(once, twice), true);
});
