import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFParse } from "pdf-parse";
import { lineAmounts, sumAmounts } from "../src/sales/money.js";
import { createInvoicePdf } from "../src/invoices/pdf.js";
import { assertPdfSize } from "../src/invoices/routes.js";

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
    dueDate: "2026-07-18",
    operationStartDate: "2026-07-01",
    operationEndDate: "2026-07-15",
    deliveryDates: ["2026-07-14"],
    paymentTerms:
      "Pago en tres días naturales. En caso de mora se aplicará la Ley 3/2004.",
    generalInformation: null,
    status: "issued" as const,
    notes: "Dato ficticio",
    subtotal: "19.7530",
    taxTotal: "0.7901",
    total: "20.5431",
    paidTotal: "0.0000",
    balanceDue: "20.5431",
    paymentStatus: "unpaid" as const,
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
        packageKind: null,
        packageLabel: null,
        packageQuantity: null,
        unitsPerPackage: null,
        deliveryDate: "2026-07-14",
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

test("el PDF sin condiciones no muestra vencimiento ni condiciones de pago", async () => {
  const invoice = {
    id: "00000000-0000-4000-8000-000000000011",
    contactId: "00000000-0000-4000-8000-000000000012",
    number: 2,
    series: "TEST",
    issueDate: "2026-08-17",
    dueDate: null,
    operationStartDate: null,
    operationEndDate: null,
    deliveryDates: [],
    paymentTerms: null,
    generalInformation: null,
    status: "issued" as const,
    notes: null,
    subtotal: "10.0000",
    taxTotal: "0.4000",
    total: "10.4000",
    paidTotal: "0.0000",
    balanceDue: "10.4000",
    paymentStatus: "unpaid" as const,
    sourceType: "manual" as const,
    contactLegalName: "Cliente sin condiciones",
    contactTaxId: "TEST-C-002",
    contactAddress: { city: "Ciudad Ficticia", country: "ES" },
    issuerLegalName: "Empresa Ficticia",
    issuerTaxId: "TEST-E-001",
    issuerAddress: { city: "Ciudad Ficticia", country: "ES" },
    issuedAt: new Date("2026-08-17T00:00:00Z"),
    cancelledAt: null,
    createdAt: new Date("2026-08-17T00:00:00Z"),
    updatedAt: new Date("2026-08-17T00:00:00Z"),
    deliveryNoteIds: [],
    lines: [
      {
        id: "00000000-0000-4000-8000-000000000013",
        productId: null,
        description: "Producto ficticio sin condiciones",
        quantity: "1.0000",
        unit: "kg" as const,
        unitPrice: "10.0000",
        taxRate: "4.000",
        lineSubtotal: "10.0000",
        lineTax: "0.4000",
        lineTotal: "10.4000",
        packageKind: null,
        packageLabel: null,
        packageQuantity: null,
        unitsPerPackage: null,
        deliveryDate: null,
        position: 1,
      },
    ],
  };
  const pdf = await createInvoicePdf(invoice, {
    name: "Empresa Ficticia",
    taxId: "TEST-E-001",
    address: {},
  });
  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  try {
    const { text } = await parser.getText();
    assert.doesNotMatch(text, /Vencimiento:/i);
    assert.doesNotMatch(text, /CONDICIONES DE PAGO/i);
  } finally {
    await parser.destroy();
  }
});

test("rechaza un PDF que excede el límite operacional", () => {
  assert.throws(() => assertPdfSize(Buffer.alloc(5_000_001)), (error) => error instanceof Error && "code" in error && error.code === "payload_too_large");
  assert.doesNotThrow(() => assertPdfSize(Buffer.alloc(5_000_000)));
});
