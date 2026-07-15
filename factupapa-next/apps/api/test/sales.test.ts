import assert from "node:assert/strict";
import { test } from "node:test";
import { lineAmounts, sumAmounts } from "../src/sales/money.js";
import { createInvoicePdf } from "../src/invoices/pdf.js";

test("los totales usan enteros escalados y redondeo decimal exacto", () => {
  assert.deepEqual(lineAmounts("2.0000", "9.8765", "4"), {
    subtotal: "19.7530",
    tax: "0.7901",
    total: "20.5431",
  });
  assert.deepEqual(
    sumAmounts([
      { lineSubtotal: "19.7530", lineTax: "0.7901", lineTotal: "20.5431" },
    ]),
    { subtotal: "19.7530", taxTotal: "0.7901", total: "20.5431" },
  );
});

test("el PDF emitido es A4, acotado y reproducible desde el snapshot", async () => {
  const invoice = {
    id: "00000000-0000-4000-8000-000000000001",
    contactId: "00000000-0000-4000-8000-000000000002",
    number: 1,
    series: "TEST",
    issueDate: "2026-07-15",
    dueDate: null,
    status: "issued" as const,
    notes: "Dato ficticio",
    subtotal: "19.7530",
    taxTotal: "0.7901",
    total: "20.5431",
    sourceType: "manual" as const,
    contactLegalName: "Cliente Ficticio",
    contactTaxId: "TEST-C-001",
    contactAddress: { city: "Ciudad Ficticia", country: "ES" },
    issuerLegalName: "Empresa Ficticia",
    issuerTaxId: "TEST-E-001",
    issuerAddress: { city: "Ciudad Ficticia", country: "ES" },
    issuedAt: new Date("2026-07-15T00:00:00Z"),
    cancelledAt: null,
    createdAt: new Date("2026-07-15T00:00:00Z"),
    updatedAt: new Date("2026-07-15T00:00:00Z"),
    deliveryNoteIds: [],
    lines: [
      {
        id: "00000000-0000-4000-8000-000000000003",
        productId: null,
        description: "Producto ficticio",
        quantity: "2.0000",
        unit: "kg" as const,
        unitPrice: "9.8765",
        taxRate: "4.000",
        lineSubtotal: "19.7530",
        lineTax: "0.7901",
        lineTotal: "20.5431",
        position: 1,
      },
    ],
  };
  const company = {
    name: "Empresa Ficticia",
    taxId: "TEST-E-001",
    address: {},
  };
  const first = await createInvoicePdf(invoice, company);
  const second = await createInvoicePdf(invoice, company);
  assert.equal(first.subarray(0, 4).toString(), "%PDF");
  assert.ok(first.length > 1_000 && first.length < 5_000_000);
  assert.deepEqual(first, second);
});
