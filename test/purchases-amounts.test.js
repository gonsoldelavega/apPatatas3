import { test } from "node:test";
import assert from "node:assert/strict";
import "../src/domain/purchases.js";

const { purchaseBase, purchaseTotal } = globalThis.AppDomainPurchases;

// El mismo parser laxo que usa la app (src/utils/numbers.js).
function n(value){
  const parsed = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

test("compra con importes explícitos usa baseAmount/totalAmount", () => {
  const purchase = { baseAmount: 100, totalAmount: 104, quantity: 999, unitCost: 999, iva: 4 };
  assert.equal(purchaseBase(purchase, n), 100);
  assert.equal(purchaseTotal(purchase, n), 104);
});

test("baseAmount vacío ('' o null) NO cuenta como 0: cae a cantidad × coste", () => {
  const purchase = { baseAmount: "", totalAmount: null, quantity: 10, unitCost: 2, iva: 21 };
  assert.equal(purchaseBase(purchase, n), 20);
  assert.equal(Math.round(purchaseTotal(purchase, n) * 100) / 100, 24.2);
});

test("compra de monedero (sin baseAmount/amount) calcula por líneas", () => {
  const purchase = { quantity: 1, unitCost: 15.5, iva: 0 };
  assert.equal(purchaseBase(purchase, n), 15.5);
  assert.equal(purchaseTotal(purchase, n), 15.5);
});

test("amount como texto numérico sigue funcionando", () => {
  const purchase = { amount: "42.35", quantity: 0, unitCost: 0, iva: 0 };
  assert.equal(purchaseTotal(purchase, n), 42.35);
});
