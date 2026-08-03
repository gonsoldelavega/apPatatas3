import assert from "node:assert/strict";
import test from "node:test";
import { createGmailRawMessage } from "../src/integrations/gmail.js";

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
