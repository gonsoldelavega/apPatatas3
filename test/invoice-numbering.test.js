import { test } from "node:test";
import assert from "node:assert/strict";
import "../src/domain/invoice-numbering.js";

const { parseInvoiceNumber, reconcileInvoiceNumbers } = globalThis.AppInvoiceNumbering;

test("parseInvoiceNumber: extrae la secuencia, no el año", () => {
  assert.deepEqual(parseInvoiceNumber("FAC-111/2026"), { seq: 111, year: 2026 });
  assert.deepEqual(parseInvoiceNumber("FAC-009/2026"), { seq: 9, year: 2026 });
  assert.equal(parseInvoiceNumber("FAC-112/2026").seq, 112);
});

test("reconcile: sin duplicados no cambia nada", () => {
  const inv = [
    { id: "a", number: "FAC-110/2026", issueDate: "2026-06-08" },
    { id: "b", number: "FAC-111/2026", issueDate: "2026-06-09" }
  ];
  const r = reconcileInvoiceNumbers(inv, { prefix: "FAC" });
  assert.equal(r.changes.length, 0);
  assert.equal(r.nextSeq, 112);
});

test("reconcile: dos facturas con el mismo numero -> renumera la mas nueva", () => {
  const inv = [
    { id: "a", number: "FAC-113/2026", issueDate: "2026-06-10" }, // keeper (más antigua)
    { id: "b", number: "FAC-113/2026", issueDate: "2026-06-11" }
  ];
  const r = reconcileInvoiceNumbers(inv, { prefix: "FAC" });
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0].id, "b");
  assert.equal(r.changes[0].from, "FAC-113/2026");
  assert.equal(r.changes[0].to, "FAC-114/2026");
  const b = r.invoices.find(x => x.id === "b");
  assert.equal(b.number, "FAC-114/2026");
  assert.equal(b.renumberedFrom, "FAC-113/2026");
});

test("reconcile: determinista por id cuando coincide la fecha (ambos moviles convergen igual)", () => {
  const inv = [
    { id: "zzz", number: "FAC-113/2026", issueDate: "2026-06-10" },
    { id: "aaa", number: "FAC-113/2026", issueDate: "2026-06-10" }
  ];
  const r = reconcileInvoiceNumbers(inv, { prefix: "FAC" });
  // keeper = id más bajo ("aaa"); se renumera "zzz"
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0].id, "zzz");
});

test("reconcile: idempotente (aplicar dos veces no genera más cambios)", () => {
  const inv = [
    { id: "a", number: "FAC-113/2026", issueDate: "2026-06-10" },
    { id: "b", number: "FAC-113/2026", issueDate: "2026-06-11" }
  ];
  const first = reconcileInvoiceNumbers(inv, { prefix: "FAC" });
  const second = reconcileInvoiceNumbers(first.invoices, { prefix: "FAC" });
  assert.equal(second.changes.length, 0);
});

test("reconcile: tres iguales -> 114 y 115", () => {
  const inv = [
    { id: "a", number: "FAC-113/2026", issueDate: "2026-06-10" },
    { id: "b", number: "FAC-113/2026", issueDate: "2026-06-11" },
    { id: "c", number: "FAC-113/2026", issueDate: "2026-06-12" }
  ];
  const r = reconcileInvoiceNumbers(inv, { prefix: "FAC" });
  const tos = r.changes.map(c => c.to).sort();
  assert.deepEqual(tos, ["FAC-114/2026", "FAC-115/2026"]);
  assert.equal(r.nextSeq, 116);
});
