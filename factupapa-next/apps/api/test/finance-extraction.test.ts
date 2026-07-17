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
test("lee una factura escaneada con cabecera y tabla fiscal separadas", () => {
  const result = extractPurchaseFields(
    `PROVEEDOR FICTICIO 2020 S.L. B12345678 Fecha: 21/05/2026
     Código Descripción Cant. Precio Importe PRODUCTO 5 10,45 52,25 €
     TOTAL Base imponible % IVA IVA 52,25 21 10,97 63,22 €`,
  );
  assert.equal(result.supplierTaxId, "B12345678");
  assert.equal(result.issueDate, "2026-05-21");
  assert.equal(result.subtotal, "52.25");
  assert.equal(result.taxTotal, "10.97");
  assert.equal(result.total, "63.22");
});
test("usa fecha y total del nombre cuando la foto no los reconoce", () => {
  const result = extractPurchaseFields(
    "PROVEEDOR FICTICIO S.L.",
    "2026-04-04_COMPRA_FICTICIA_14,14.pdf",
  );
  assert.equal(result.issueDate, "2026-04-04");
  assert.equal(result.total, "14.14");
});
test("normaliza números OCR y reconcilia base, IVA y total entre columnas", () => {
  const result = extractPurchaseFields(
    "Fecha Numero Vendedor 01/04/2026 FVØ06-00000709 Base Imponible %IVA Importe IVA TOTAL FACTURA 13.60 13.60 4.00 0.54 14.14",
  );
  assert.equal(result.supplierInvoiceNumber, "FV006-00000709");
  assert.equal(result.subtotal, "13.60");
  assert.equal(result.taxTotal, "0.54");
  assert.equal(result.total, "14.14");
  assert.ok(!result.warnings?.includes("totals_mismatch"));
});
test("extrae varias líneas sin confundir el resumen fiscal", () => {
  const result = extractPurchaseFields(
    `FACTURA Número: PR-130 Fecha: 17/07/2026 CIF: B12345678
     PATATA AGRIA 210 kg 0,5000 105,00
     TRANSPORTE 1 ud 12,00 12,00
     Base imponible 117,00 IVA 4,68 TOTAL 121,68`,
  );
  assert.deepEqual(result.lines, [
    {
      description: "PATATA AGRIA",
      quantity: "210",
      unit: "kg",
      unitCost: "0.5",
      taxRate: "4",
    },
    {
      description: "TRANSPORTE",
      quantity: "1",
      unit: "unit",
      unitCost: "12",
      taxRate: "4",
    },
  ]);
  assert.equal(result.purchasedQuantityKg, "210");
  assert.equal(result.purchasedSacks, 14);
});
test("descarta filas OCR cuyos importes no cuadran", () => {
  const result = extractPurchaseFields(
    "FACTURA Fecha: 17/07/2026 CIF: B12345678 PRODUCTO 10 kg 5,00 999,00 TOTAL 999,00",
  );
  assert.equal(result.lines, undefined);
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
