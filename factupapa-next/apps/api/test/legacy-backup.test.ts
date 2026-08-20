import assert from "node:assert/strict";
import test from "node:test";
import {
  isLegacyRecurringExpense,
  legacyRecurringDefinitions,
  legacyPurchaseNumber,
  legacyPurchaseLineAmounts,
  normalizeLegacyManualExpense,
} from "../src/imports/legacy-backup.js";

test("recognizes and collapses automatic monthly legacy expenses", () => {
  const expenses = [
    {
      id: "exp-gestoria-2026-06",
      date: "2026-06-01",
      concept: "Gestoría mensual",
      category: "gestoria",
      base: 24,
      iva: 21,
      notes: "Gasto recurrente mensual automático",
    },
    {
      id: "exp-gestoria-2026-07",
      date: "2026-07-01",
      concept: "Gestoría mensual",
      category: "gestoria",
      base: 25,
      ivaPct: 21,
      total: 30.25,
      notes: "Gasto recurrente mensual automático",
    },
    {
      id: "exp-autonomos-2026-07",
      date: "2026-07-01",
      concept: "Cuota autónomos",
      category: "seguridad_social",
      base: 88.56,
      iva: 0,
      notes: "Gasto recurrente mensual automático",
    },
    {
      id: "exp-manual",
      date: "2026-07-03",
      concept: "Gasolina",
      category: "transporte",
      base: 40,
      iva: 21,
    },
  ];

  assert.equal(isLegacyRecurringExpense(expenses[0]!), true);
  assert.equal(isLegacyRecurringExpense(expenses[3]!), false);
  assert.deepEqual(legacyRecurringDefinitions(expenses), [
    {
      key: "cuota autonomos",
      name: "Cuota autónomos",
      category: "autonomo",
      amount: 88.56,
      taxRate: 0,
      chargeDay: 1,
      startsOn: "2026-07-01",
      supplierLegacyId: null,
      sourceRows: 1,
    },
    {
      key: "gestoria mensual",
      name: "Gestoría mensual",
      category: "gestoria",
      amount: 30.25,
      taxRate: 21,
      chargeDay: 1,
      startsOn: "2026-06-01",
      supplierLegacyId: null,
      sourceRows: 2,
    },
  ]);
});

test("creates a stable synthetic reference only when a purchase has no number", () => {
  assert.deepEqual(legacyPurchaseNumber("buy-1", "PROV-42"), {
    number: "PROV-42",
    synthetic: false,
  });
  assert.deepEqual(legacyPurchaseNumber("buy-1", null), legacyPurchaseNumber("buy-1", ""));
  assert.equal(legacyPurchaseNumber("buy-1", null).synthetic, true);
  assert.match(legacyPurchaseNumber("buy-1", null).number, /^SIN-NUM-[A-F0-9]{12}$/);
  assert.notEqual(
    legacyPurchaseNumber("buy-1", null).number,
    legacyPurchaseNumber("buy-2", null).number,
  );
});

test("preserves coherent fiscal totals when legacy quantity and unit cost disagree", () => {
  assert.deepEqual(
    legacyPurchaseLineAmounts({ quantity: 6, unitCost: 0.55, base: 49.5, ivaPct: 4, total: 51.48 }),
    {
      quantity: 6,
      unitCost: 8.25,
      taxRate: 4,
      subtotal: 49.5,
      tax: 1.98,
      total: 51.48,
    },
  );
});

test("derives the fiscal base from total when the legacy base is corrupt", () => {
  assert.deepEqual(
    legacyPurchaseLineAmounts({ quantity: 1, price: 4, base: 4, ivaPct: 4, total: 48.4 }),
    {
      quantity: 1,
      unitCost: 46.5385,
      taxRate: 4,
      subtotal: 46.5385,
      tax: 1.8615,
      total: 48.4,
    },
  );
});

test("normalizes a manual legacy expense into exact purchase totals", () => {
  assert.deepEqual(
    normalizeLegacyManualExpense({
      id: "exp-gasolina-1",
      date: "2026-07-03",
      supplierId: "supplier-1",
      concept: "Gasolina reparto",
      category: "transporte",
      base: 40,
      iva: 21,
      notes: "Ticket 123",
    }),
    {
      legacyId: "exp-gasolina-1",
      issueDate: "2026-07-03",
      supplierLegacyId: "supplier-1",
      concept: "Gasolina reparto",
      category: "transporte",
      subtotal: 40,
      taxRate: 21,
      taxTotal: 8.4,
      total: 48.4,
      notes: "Ticket 123",
    },
  );
});

test("does not duplicate recurring expenses as manual purchases", () => {
  assert.equal(
    normalizeLegacyManualExpense({
      id: "exp-gestoria-2026-08",
      date: "2026-08-01",
      concept: "Gestoría mensual",
      base: 25,
      iva: 21,
      notes: "Gasto recurrente mensual automático",
    }),
    null,
  );
});

test("ignores malformed recurring rows without a usable date", () => {
  assert.deepEqual(
    legacyRecurringDefinitions([
      {
        id: "exp-gestoria-invalid",
        concept: "Gestoría mensual",
        notes: "Gasto recurrente mensual automático",
        base: 24,
      },
    ]),
    [],
  );
});
