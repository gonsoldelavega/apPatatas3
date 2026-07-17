import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPurchaseFields } from "../src/finance/extraction.js";
import { validatePurchase, validateStockLevel } from "../src/finance/validation.js";
test("extrae y contrasta los campos fiscales sin conservar el texto", () => {
  const result = extractPurchaseFields(
    "FACTURA Número: PR-128 Fecha de emisión: 15/07/2026 Vencimiento: 30/07/2026 " +
      "CIF: B12345678 Base imponible 100,00 IVA 4% 4,00 TOTAL FACTURA 104,00 EUR",
  );
  assert.deepEqual(result, {
    supplierInvoiceNumber: "PR-128",
    issueDate: "2026-07-15",
    dueDate: "2026-07-30",
    subtotal: "100.00",
    taxTotal: "4.00",
    total: "104.00",
    supplierTaxId: "B12345678",
    warnings: [],
  });
});
test("marca importes incoherentes para revisión humana", () => {
  const result = extractPurchaseFields(
    "FACTURA Número: PR-129 Fecha: 16/07/2026 CIF: B12345678 Base imponible 100,00 IVA 4% 4,00 TOTAL 120,00",
  );
  assert.ok(result.warnings?.includes("totals_mismatch"));
});
test("convierte sacos de 15 kg en kilos de stock", () => {
  const result = extractPurchaseFields(
    "PATATA AGRIA 20 sacos x 15 kg Base imponible 300,00 TOTAL 312,00",
  );
  assert.equal(result.purchasedSacks, 20);
  assert.equal(result.purchasedQuantityKg, "300");
});
test("rechaza fechas inexistentes", () =>
  assert.throws(() =>
    validatePurchase({
      supplierId: "11111111-1111-4111-8111-111111111111",
      issueDate: "2026-02-30",
      lines: [],
    }),
  ));
test("el recuento físico admite cero pero nunca cantidades negativas", () => {
  assert.equal(
    validateStockLevel({
      productId: "11111111-1111-4111-8111-111111111111",
      occurredOn: "2026-07-17",
      targetQuantity: "0",
      note: null,
    }).targetQuantity,
    "0",
  );
  assert.throws(() =>
    validateStockLevel({
      productId: "11111111-1111-4111-8111-111111111111",
      occurredOn: "2026-07-17",
      targetQuantity: "-1",
      note: null,
    }),
  );
});
