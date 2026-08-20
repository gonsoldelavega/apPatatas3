import assert from "node:assert/strict";
import test from "node:test";
import {
  collectGmailPurchaseAttachments,
  createGmailRawMessage,
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

test("solo selecciona adjuntos de factura compatibles dentro de MIME anidado", () => {
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
