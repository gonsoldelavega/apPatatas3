import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPurchaseFields } from "../src/finance/extraction.js";
import { validatePurchase } from "../src/finance/validation.js";
test("extrae sugerencias sin conservar texto", () =>
  assert.deepEqual(
    extractPurchaseFields(
      "FACTURA Número: PR-128 Fecha de emisión: 15/07/2026 CIF: B12345678 TOTAL FACTURA 104,00 EUR",
    ),
    {
      supplierInvoiceNumber: "PR-128",
      issueDate: "2026-07-15",
      total: "104.00",
      supplierTaxId: "B12345678",
    },
  ));
test("rechaza fechas inexistentes", () =>
  assert.throws(() =>
    validatePurchase({
      supplierId: "11111111-1111-4111-8111-111111111111",
      issueDate: "2026-02-30",
      lines: [],
    }),
  ));
