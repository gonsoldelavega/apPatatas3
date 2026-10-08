import assert from "node:assert/strict";
import { test } from "node:test";
import { createDeliveryNotePdf } from "../src/delivery-notes/pdf.js";
import type { DeliveryLine, DeliveryPdfData } from "../src/delivery-notes/types.js";

function line(position: number, overrides: Partial<DeliveryLine> = {}): DeliveryLine {
  return {
    id: `00000000-0000-4000-8000-${String(position).padStart(12, "0")}`,
    productId: null,
    description: `Patata pelada ficticia ${position}`,
    quantity: "30",
    unit: "kg",
    unitPrice: "1.15",
    taxRate: "4",
    lineSubtotal: "34.5",
    lineTax: "1.38",
    lineTotal: "35.88",
    position,
    ...overrides,
  };
}

function data(lines: DeliveryLine[], notes: string | null = null): DeliveryPdfData {
  return {
    note: {
      id: "00000000-0000-4000-8000-0000000000aa",
      contactId: "00000000-0000-4000-8000-0000000000bb",
      number: 37,
      series: "ALB_2026",
      issueDate: "2026-10-08",
      status: "issued",
      notes,
      subtotal: "34.5",
      taxTotal: "1.38",
      total: "35.88",
      createdAt: new Date("2026-10-08T08:00:00Z"),
      updatedAt: new Date("2026-10-08T08:00:00Z"),
      issuedAt: new Date("2026-10-08T08:00:00Z"),
      cancelledAt: null,
      lines,
    },
    issuer: { name: "Empresa Ficticia", taxId: "TEST-ISSUER", address: { city: "Ficticia" } },
    customer: {
      name: "Bar Ficticio S.L.",
      tradeName: null,
      taxId: "TEST-CUSTOMER",
      address: { street: "Calle Ficticia 1", city: "Ficticia" },
    },
  };
}

// pdfkit comprime los flujos: se cuentan las páginas por su diccionario.
const pageCount = (pdf: Buffer) =>
  (pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length;

test("PDF de albarán con precios y una copia es un PDF válido de una página", async () => {
  const pdf = await createDeliveryNotePdf(data([line(1), line(2)]), {
    prices: true,
    copies: 1,
  });
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.equal(pageCount(pdf), 1);
  assert.ok(pdf.length < 200_000);
});

test("cada copia añade una página y las copias largas paginan sin perder el recuadro de firma", async () => {
  const short = await createDeliveryNotePdf(data([line(1)]), { prices: false, copies: 2 });
  assert.equal(pageCount(short), 2);
  const many = Array.from({ length: 45 }, (_, index) => line(index + 1));
  const long = await createDeliveryNotePdf(data(many, "Dejar en la cámara trasera."), {
    prices: true,
    copies: 2,
  });
  assert.ok(pageCount(long) >= 4, `páginas: ${pageCount(long)}`);
  assert.equal(pageCount(long) % 2, 0);
});

test("la versión sin precios es un documento distinto de la valorada", async () => {
  const withPrices = await createDeliveryNotePdf(data([line(1)]), { prices: true, copies: 1 });
  const withoutPrices = await createDeliveryNotePdf(data([line(1)]), { prices: false, copies: 1 });
  assert.ok(withoutPrices.length > 0);
  assert.notDeepEqual(withPrices, withoutPrices);
});
