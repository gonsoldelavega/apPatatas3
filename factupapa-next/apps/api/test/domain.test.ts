import assert from "node:assert/strict";
import test from "node:test";
import {
  validateContactCreate,
  validateContactPatch,
} from "../src/contacts/validation.js";
import { calculateMargin } from "../src/domain/money.js";
import { validatePrice } from "../src/pricing/validation.js";
import { validateProductCreate } from "../src/products/validation.js";

test("contactos validan claves, formatos y dirección estructurada", () => {
  assert.deepEqual(
    validateContactCreate({
      type: "both",
      legalName: "  Empresa ficticia  ",
      email: "TEST@EXAMPLE.TEST",
      taxId: "b-12345678",
      address: { city: "Madrid", country: "es" },
    }),
    {
      type: "both",
      legalName: "Empresa ficticia",
      email: "test@example.test",
      taxId: "B-12345678",
      address: { city: "Madrid", country: "ES" },
    },
  );
  assert.throws(() =>
    validateContactCreate({
      type: "customer",
      legalName: "X",
      companyId: crypto.randomUUID(),
    }),
  );
  assert.throws(() => validateContactPatch({}));
  assert.throws(() => validateContactPatch({ email: "sin-arroba" }));
  assert.throws(() => validateContactPatch({ address: { unknown: "x" } }));
});

test("productos y precios exigen cadenas decimales y unidades admitidas", () => {
  assert.deepEqual(
    validateProductCreate({
      name: "Producto",
      unit: "kg",
      salePrice: "0012.3400",
      estimatedCost: "8.1",
      taxRate: "4.000",
    }),
    {
      name: "Producto",
      unit: "kg",
      salePrice: "12.34",
      estimatedCost: "8.1",
      taxRate: "4",
    },
  );
  assert.throws(() =>
    validateProductCreate({
      name: "X",
      unit: "litre",
      salePrice: "1",
      taxRate: "21",
    }),
  );
  assert.throws(() =>
    validateProductCreate({
      name: "X",
      unit: "unit",
      salePrice: 1.25,
      taxRate: "21",
    }),
  );
  assert.throws(() =>
    validateProductCreate({
      name: "X",
      unit: "unit",
      salePrice: "1",
      taxRate: "100.1",
    }),
  );
  assert.deepEqual(
    validatePrice({ price: "9.8765", validFrom: "2026-07-14" }),
    {
      price: "9.8765",
      validFrom: "2026-07-14",
    },
  );
});

test("margen se calcula con enteros escalados y nunca se almacena", () => {
  assert.deepEqual(calculateMargin("12.3400", "8.1100"), {
    amount: "4.23",
    percentage: "34.27",
  });
  assert.deepEqual(calculateMargin("0", "2.5000"), {
    amount: "-2.5",
    percentage: null,
  });
  assert.equal(calculateMargin("12.34", null), null);
});
