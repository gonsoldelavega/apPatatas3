import { test } from "node:test";
import assert from "node:assert/strict";

// migrations.js es un IIFE que se cuelga de window: en node lo simulamos.
globalThis.window = globalThis;
await import("../src/state/migrations.js");
const { migrateState } = globalThis.AppMigrations;

const options = {
  createDefaultState: () => ({
    settings: { invoicePrefix: "FAC", invoiceYear: 2026, nextInvoiceNumber: 1 },
    templates: [], clients: [], suppliers: [], products: [], purchases: [],
    expenses: [], walletMovements: [], deliveryNotes: [], invoices: [], documents: [],
    _deleted: {},
    _sync: { updatedAt: "", version: 1 }
  }),
  seed: { clients: [], products: [], invoices: [] },
  uid: prefix => `${prefix}-test`
};

function baseSaved(invoices){
  return { settings: {}, invoices };
}

test("caso real: misma factura duplicada (id idéntico) con 121 y 122 -> queda una sola con 121", () => {
  const saved = baseSaved([
    { id: "fac-a282e5f8xwl", number: "FAC-122/2026", issueDate: "2026-07-03", amountPaid: 0, updatedAt: "2026-07-03T13:42:14Z", lines: [] },
    { id: "fac-a282e5f8xwl", number: "FAC-121/2026", issueDate: "2026-07-03", amountPaid: 0, updatedAt: "2026-07-03T13:40:07Z", lines: [] },
    { id: "fac-otro", number: "FAC-120/2026", issueDate: "2026-06-30", amountPaid: 50, updatedAt: "2026-06-30T18:23:06Z", lines: [] }
  ]);
  const next = migrateState(saved, options);
  assert.equal(next.invoices.length, 2);
  const repaired = next.invoices.find(x => x.id === "fac-a282e5f8xwl");
  assert.equal(repaired.number, "FAC-121/2026");
  assert.ok(next.invoices.some(x => x.number === "FAC-120/2026"));
});

test("facturas distintas (ids distintos) no se tocan aunque compartan número", () => {
  const saved = baseSaved([
    { id: "fac-a", number: "FAC-110/2026", lines: [] },
    { id: "fac-b", number: "FAC-110/2026", lines: [] }
  ]);
  const next = migrateState(saved, options);
  assert.equal(next.invoices.length, 2);
});

test("al colapsar duplicados se conserva el mayor importe cobrado", () => {
  const saved = baseSaved([
    { id: "fac-x", number: "FAC-118/2026", amountPaid: 0, lines: [] },
    { id: "fac-x", number: "FAC-117/2026", amountPaid: 80, lines: [] }
  ]);
  const next = migrateState(saved, options);
  assert.equal(next.invoices.length, 1);
  assert.equal(next.invoices[0].number, "FAC-117/2026");
  assert.equal(next.invoices[0].amountPaid, 80);
});

test("facturas demo INVxx se purgan y el dedupe no interfiere", () => {
  const saved = baseSaved([
    { id: "fac-demo", number: "INV76", lines: [] },
    { id: "fac-real", number: "FAC-119/2026", lines: [] }
  ]);
  const next = migrateState(saved, options);
  assert.equal(next.invoices.length, 1);
  assert.equal(next.invoices[0].number, "FAC-119/2026");
});
