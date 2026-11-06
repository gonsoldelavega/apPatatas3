import assert from "node:assert/strict";
import { test } from "node:test";
import { computeBalance, emptyTotals, fromCents, toCents, type SideTotals } from "../src/workspace/ledger-math.js";

const totals = (partial: Partial<SideTotals>): SideTotals => ({ ...emptyTotals(), ...partial });

test("ejemplo del dueño: ellos pagan 35 € de material y nosotros 500 € del local", () => {
  // side_a = Irene y Nando (local 500) · side_b = Roberto y Gemma (material 35)
  const balance = computeBalance(totals({ expenseCents: toCents("500") }), totals({ expenseCents: toCents("35") }));
  assert.equal(balance.debtor, "side_b");
  assert.equal(balance.creditor, "side_a");
  assert.equal(fromCents(balance.cents), "232.50");
});

test("si los dos pagan lo mismo no se debe nada", () => {
  const balance = computeBalance(totals({ expenseCents: 10000n }), totals({ expenseCents: 10000n }));
  assert.deepEqual(balance, { debtor: null, creditor: null, cents: 0n });
});

test("un ingreso cobrado por un núcleo: ese núcleo debe la mitad al otro", () => {
  const balance = computeBalance(totals({ incomeCents: toCents("1000") }), totals({}));
  assert.equal(balance.debtor, "side_a");
  assert.equal(fromCents(balance.cents), "500.00");
});

test("gastos e ingresos se compensan entre sí", () => {
  // A cobra 300 y paga 100 de gasto; B paga 50. Neto: ingresos 300 − gastos 150 = 150 → 75 cada uno.
  // A tiene 300 y gastó 100 (queda con 200 de caja); B gastó 50. Reparto justo: cada uno 75 de beneficio.
  // A debe a B: 300/2 − 100/2... se comprueba con la fórmula general:
  const balance = computeBalance(
    totals({ incomeCents: toCents("300"), expenseCents: toCents("100") }),
    totals({ expenseCents: toCents("50") }),
  );
  // halves = (100 − 50) + (0 − 300) = −250 → A debe a B 125
  assert.equal(balance.debtor, "side_a");
  assert.equal(fromCents(balance.cents), "125.00");
});

test("una liquidación deja las cuentas a cero", () => {
  const before = computeBalance(totals({ expenseCents: toCents("500") }), totals({ expenseCents: toCents("35") }));
  const settled = computeBalance(
    totals({ expenseCents: toCents("500") }),
    totals({ expenseCents: toCents("35"), settlementCents: before.cents }),
  );
  assert.deepEqual(settled, { debtor: null, creditor: null, cents: 0n });
});

test("liquidación parcial: queda lo que falta", () => {
  const settled = computeBalance(
    totals({ expenseCents: toCents("500") }),
    totals({ expenseCents: toCents("35"), settlementCents: toCents("100") }),
  );
  assert.equal(settled.debtor, "side_b");
  assert.equal(fromCents(settled.cents), "132.50");
});

test("pagar de más cambia el sentido de la deuda", () => {
  const settled = computeBalance(
    totals({ expenseCents: toCents("500") }),
    totals({ expenseCents: toCents("35"), settlementCents: toCents("300") }),
  );
  assert.equal(settled.debtor, "side_a");
  assert.equal(fromCents(settled.cents), "67.50");
});

test("céntimos impares: no se pierde nada y nunca queda una deuda fantasma tras liquidar", () => {
  const a = totals({ expenseCents: toCents("0.01") });
  const b = totals({});
  const balance = computeBalance(a, b); // medio céntimo → no se muestra
  assert.deepEqual(balance, { debtor: null, creditor: null, cents: 0n });
  const more = computeBalance(totals({ expenseCents: toCents("10.01") }), totals({}));
  assert.equal(fromCents(more.cents), "5.00"); // 5,005 → 5,00 (el medio céntimo se arrastra)
  const after = computeBalance(totals({ expenseCents: toCents("10.01") }), totals({ settlementCents: more.cents }));
  assert.deepEqual(after, { debtor: null, creditor: null, cents: 0n });
});

test("conversión de importes", () => {
  assert.equal(toCents("35"), 3500n);
  assert.equal(toCents("35.5"), 3550n);
  assert.equal(toCents("0.05"), 5n);
  assert.equal(fromCents(5n), "0.05");
  assert.equal(fromCents(123456n), "1234.56");
  assert.throws(() => toCents("abc"));
});
