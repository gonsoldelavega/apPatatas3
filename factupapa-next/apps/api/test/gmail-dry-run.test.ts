import assert from "node:assert/strict";
import test from "node:test";
import { GmailIntegrationService } from "../src/integrations/gmail.js";

const identity = {
  companyId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  email: "gonsoldelavega@gmail.com",
  displayName: "Test",
  companyName: "Test",
  role: "owner",
  familyId: "test-family",
} as const;

function fakePool(sqlLog: string[]) {
  const client = {
    async query(sql: string) {
      sqlLog.push(sql);
      if (sql.includes("from gmail_integrations"))
        return { rows: [{ encryptedRefreshToken: "unused", scopes: ["https://www.googleapis.com/auth/gmail.readonly"], googleEmail: identity.email, inboxCursorAt: null }] };
      if (sql.includes("from contacts")) return { rows: [{ id: "supplier-1" }] };
      return { rows: [] };
    },
    release() {},
  };
  return { async connect() { return client; } } as never;
}

test("Gmail dry-run reutiliza el pipeline y no persiste compras, imports ni cursor", async () => {
  const sqlLog: string[] = [];
  const service = new GmailIntegrationService(fakePool(sqlLog), {
    clientId: "client",
    clientSecret: "secret",
    redirectUri: "https://example.test/callback",
    frontendUrl: "https://example.test",
    encryptionSecret: "a-secret-long-enough-for-tests",
  });
  const now = Date.now();
  const pdf = Buffer.from("%PDF-test").toString("base64url");
  const internals = service as unknown as {
    decrypt: () => string;
    accessToken: () => Promise<string>;
    gmailJson: (token: string, path: string) => Promise<unknown>;
  };
  internals.decrypt = () => "refresh-token";
  internals.accessToken = async () => "token";
  internals.gmailJson = async (_token, path) => {
    if (path.startsWith("/messages?q=")) return { messages: [{ id: "message-1" }] };
    if (path === "/messages/message-1?format=full")
      return {
        id: "message-1",
        internalDate: String(now),
        payload: {
          headers: [
            { name: "From", value: "supplier@example.test" },
            { name: "Subject", value: "Factura proveedor" },
          ],
          parts: [{ filename: "factura.pdf", mimeType: "application/pdf", body: { attachmentId: "attachment-1" } }],
        },
      };
    return { data: pdf };
  };
  let createPurchaseCalls = 0;
  const persistValues: unknown[] = [];
  const finance = {
    findPurchaseDocumentBySha: async () => undefined,
    uploadDocument: async (_identity: unknown, input: { persist?: unknown }) => {
      persistValues.push(input.persist);
      return {
        id: "preview-document",
        extractedData: {
          documentType: "supplier_invoice",
          purchaseEligible: true,
          classificationConfidence: 0.98,
          supplierTaxId: "B12345678",
          supplierName: "Proveedor Test",
          supplierInvoiceNumber: "F-1",
          issueDate: "2026-08-29",
          total: "10.00",
          taxTotal: "0.40",
          lines: [{ description: "Producto", quantity: "1", unitCost: "9.60", taxRate: "4" }],
          source: "pdf_text",
        },
      };
    },
    createPurchase: async () => { createPurchaseCalls += 1; },
  } as never;

  const first = await service.syncInbox(identity, finance, { dryRun: true });
  const second = await service.syncInbox(identity, finance, { dryRun: true });
  assert.equal(first.autoImportable, 1);
  assert.equal(first.autoImported, 0);
  assert.equal(first.review, 0);
  assert.equal(first.errors, 0);
  assert.deepEqual(first, second);
  assert.deepEqual(persistValues, [false, false]);
  assert.equal(createPurchaseCalls, 0);
  assert.equal(sqlLog.filter((sql) => /insert into gmail_purchase_imports|update gmail_purchase_imports|insert into documents/i.test(sql)).length, 0);
  assert.equal(sqlLog.filter((sql) => /update gmail_integrations/i.test(sql)).length, 0);
});
