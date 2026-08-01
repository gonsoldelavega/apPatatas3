import assert from "node:assert/strict";
import test from "node:test";
import {
  isLegacyRecurringExpense,
  legacyRecurringDefinitions,
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
