import assert from "node:assert/strict";
import test from "node:test";
import {
  collectGmailPurchaseAttachments,
  createGmailRawMessage,
  normalizedGmailAttachmentMime,
  isPlausibleGmailAttachment,
  decideGmailDocument,
  shouldIgnoreGmailMessage,
} from "../src/integrations/gmail.js";

test("creates a Gmail MIME message with the invoice PDF attached", () => {
  const raw = createGmailRawMessage({
    from: "facturas@example.com",
    to: "cliente@example.com",
    subject: "Factura FAC-42 · FactuPapa",
    body: "Adjuntamos tu factura.",
    filename: "factura-FAC-42.pdf",
    pdf: Buffer.from("%PDF-test"),
  });
  const message = Buffer.from(raw, "base64url").toString("utf8");

  assert.match(message, /From: facturas@example\.com/);
  assert.match(message, /To: cliente@example\.com/);
  assert.match(message, /Content-Type: application\/pdf/);
  assert.match(message, /filename="factura-FAC-42\.pdf"/);
  assert.match(message, new RegExp(Buffer.from("%PDF-test").toString("base64")));
  assert.equal(message.replaceAll("\r\n", "").includes("\n"), false);
});

test("solo selecciona adjuntos documentales compatibles dentro de MIME anidado", () => {
  const parts = collectGmailPurchaseAttachments({
    mimeType: "multipart/mixed",
    parts: [
      { filename: "factura.pdf", mimeType: "application/pdf", body: { attachmentId: "pdf-1" } },
      {
        mimeType: "multipart/related",
        parts: [
          { filename: "factura.png", mimeType: "image/png", body: { attachmentId: "png-1" } },
          { filename: "factura.exe", mimeType: "application/octet-stream", body: { attachmentId: "bad-1" } },
          { filename: "", mimeType: "image/jpeg", body: { attachmentId: "inline-logo" } },
        ],
      },
    ],
  });
  assert.deepEqual(parts.map((part) => part.filename), ["factura.pdf", "factura.png"]);
});

test("acepta PDF reales aunque Gmail los etiquete como base64 u octet-stream", () => {
  assert.equal(
    normalizedGmailAttachmentMime({ filename: "Facturas.pdf", mimeType: "application/base64" }),
    "application/pdf",
  );
  assert.equal(
    normalizedGmailAttachmentMime({ filename: "FacturaProveedor.PDF", mimeType: "application/octet-stream" }),
    "application/pdf",
  );
});

test("normaliza imágenes por extensión cuando Gmail usa un MIME genérico", () => {
  assert.equal(
    normalizedGmailAttachmentMime({ filename: "captura.JPEG", mimeType: "application/octet-stream" }),
    "image/jpeg",
  );
  assert.equal(
    normalizedGmailAttachmentMime({ filename: "factura.png", mimeType: "application/base64" }),
    "image/png",
  );
});

test("rechaza extensiones peligrosas aunque el MIME sea genérico", () => {
  for (const filename of ["factura.exe", "factura.zip", "factura.eml", "factura.docx"])
    assert.equal(
      normalizedGmailAttachmentMime({ filename, mimeType: "application/octet-stream" }),
      null,
      filename,
    );
});

test("rechaza contradicción explícita entre extensión y MIME documental", () => {
  assert.equal(
    normalizedGmailAttachmentMime({ filename: "factura.pdf", mimeType: "image/png" }),
    null,
  );
});

test("clasifica el correo irrelevante antes de descargar adjuntos", () => {
  assert.equal(shouldIgnoreGmailMessage({
    id: "m1",
    snippet: "Your GitHub notification",
    payload: { headers: [{ name: "From", value: "notifications@github.com" }, { name: "Subject", value: "New activity" }] },
  }), true);
  assert.equal(shouldIgnoreGmailMessage({
    id: "m2",
    snippet: "Factura adjunta",
    payload: { headers: [{ name: "From", value: "unknown@example.com" }, { name: "Subject", value: "Documento" }] },
  }), false);
});

test("excluye imágenes decorativas y decide el pipeline fiscal", () => {
  assert.equal(isPlausibleGmailAttachment({ filename: "logo.png", mimeType: "image/png", body: { size: 1000 }, headers: [{ name: "Content-Disposition", value: "inline" }] }), false);
  assert.equal(decideGmailDocument({ documentType: "issued_sales_invoice" }), "ignore");
  assert.equal(decideGmailDocument({ documentType: "bank_transfer_receipt" }), "ignore");
  assert.equal(decideGmailDocument({ documentType: "supplier_invoice", purchaseEligible: true, classificationConfidence: 0.95, supplierTaxId: "B123", issueDate: "2026-01-01", total: "10", supplierInvoiceNumber: "A-1" }), "auto_import");
  assert.equal(decideGmailDocument({ documentType: "supplier_invoice", supplierName: "Proveedor", total: "10" }), "review");
  assert.equal(decideGmailDocument({ documentType: "unknown" }), "ignore");
});
