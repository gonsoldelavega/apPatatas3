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

function fakePool(sqlLog: string[], inboxCursorAt: string | null = null, withSupplier = true, existingImport?: { id: string; status: string; documentId: string | null }) {
  const client = {
    async query(sql: string) {
      sqlLog.push(sql);
      if (sql.includes("from gmail_integrations"))
        return { rows: [{ encryptedRefreshToken: "unused", scopes: ["https://www.googleapis.com/auth/gmail.readonly"], googleEmail: identity.email, inboxCursorAt }] };
      if (sql.includes("from gmail_purchase_imports")) return { rows: existingImport ? [existingImport] : [] };
      if (sql.includes("from contacts")) return { rows: withSupplier ? [{ id: "supplier-1" }] : [] };
      return { rows: [] };
    },
    release() {},
  };
  return { async connect() { return client; } } as never;
}

test("real sync reextrae un needs_review existente antes de aplicar deduplicación SHA", async () => {
  const sqlLog: string[] = [];
  const service = new GmailIntegrationService(fakePool(sqlLog, null, true, { id: "import-1", status: "needs_review", documentId: "11111111-1111-4111-8111-111111111111" }), {
    clientId: "client", clientSecret: "secret", redirectUri: "https://example.test/callback",
    frontendUrl: "https://example.test", encryptionSecret: "a-secret-long-enough-for-tests",
  });
  const now = Date.now();
  const internals = service as unknown as { decrypt: () => string; accessToken: () => Promise<string>; gmailJson: (token: string, path: string) => Promise<unknown> };
  internals.decrypt = () => "refresh-token";
  internals.accessToken = async () => "token";
  internals.gmailJson = async (_token, path) => {
    if (path.startsWith("/messages?q=")) return { messages: [{ id: "message-retry" }] };
    if (path === "/messages/message-retry?format=full") return { id: "message-retry", internalDate: String(now), payload: { headers: [{ name: "From", value: "supplier@example.test" }, { name: "Subject", value: "Factura corregida" }], parts: [{ filename: "factura.pdf", mimeType: "application/pdf", body: { attachmentId: "attachment-retry" } }] } };
    return { data: Buffer.from("%PDF-test").toString("base64url") };
  };
  const uploadInputs: unknown[] = [];
  const finance = {
    findPurchaseDocumentBySha: async () => ({ id: "sha-duplicate" }),
    uploadDocument: async (_identity: unknown, input: { documentId?: unknown; persist?: unknown }) => {
      uploadInputs.push(input);
      return { id: "11111111-1111-4111-8111-111111111111", extractedData: { documentType: "supplier_invoice", purchaseEligible: true, classificationConfidence: 0.9, supplierTaxId: "B12345678", supplierName: "Proveedor", supplierInvoiceNumber: "F-1", issueDate: "2026-08-29", total: "10.00", lines: [{ description: "Producto", quantity: "1", unitCost: "10", taxRate: "0" }] } };
    },
    createPurchase: async () => undefined,
  } as never;
  const result = await service.syncInbox(identity, finance, {});
  assert.equal(result.errors, 0);
  assert.deepEqual(uploadInputs, [{ documentId: "11111111-1111-4111-8111-111111111111", persist: true, filename: "factura.pdf", mimeType: "application/pdf", contentBase64: Buffer.from("%PDF-test").toString("base64") }]);
  assert.equal(sqlLog.some((sql) => /insert into gmail_purchase_imports/i.test(sql)), false);
});

test("Gmail autoimporta en staging un proveedor fiscal sólido aunque aún no exista", async () => {
  const sqlLog: string[] = [];
  const service = new GmailIntegrationService(fakePool(sqlLog, null, false), {
    clientId: "client", clientSecret: "secret", redirectUri: "https://example.test/callback",
    frontendUrl: "https://example.test", encryptionSecret: "a-secret-long-enough-for-tests",
  });
  const now = Date.now();
  const internals = service as unknown as { decrypt: () => string; accessToken: () => Promise<string>; gmailJson: (token: string, path: string) => Promise<unknown> };
  internals.decrypt = () => "refresh-token";
  internals.accessToken = async () => "token";
  internals.gmailJson = async (_token, path) => {
    if (path.startsWith("/messages?q=")) return { messages: [{ id: "message-strong" }] };
    if (path === "/messages/message-strong?format=full") return { id: "message-strong", internalDate: String(now), payload: { headers: [{ name: "From", value: "new@supplier.test" }, { name: "Subject", value: "Factura proveedor" }], parts: [{ filename: "factura.pdf", mimeType: "application/pdf", body: { attachmentId: "attachment-strong" } }] } };
    return { data: Buffer.from("%PDF-test").toString("base64url") };
  };
  const finance = {
    findPurchaseDocumentBySha: async () => undefined,
    uploadDocument: async () => ({ id: "preview-document", extractedData: { documentType: "supplier_invoice", purchaseEligible: true, classificationConfidence: 0.82, supplierTaxId: "B12345678", supplierName: "Proveedor Nuevo", supplierInvoiceNumber: "F-2", issueDate: "2026-08-29", total: "10.00", lines: [{ description: "Producto", quantity: "1", unitCost: "9.60", taxRate: "4" }] } }),
  } as never;
  const result = await service.syncInbox(identity, finance, { dryRun: true });
  assert.equal(result.autoImportable, 1);
  assert.equal(result.review, 0);
  assert.equal(sqlLog.some((sql) => /insert into contacts/i.test(sql)), false);
});

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

test("lookback histórico sólo amplía dry-run y nunca la sincronización normal", async () => {
  const sqlLog: string[] = [];
  const service = new GmailIntegrationService(fakePool(sqlLog, "2026-08-29T00:00:00.000Z"), {
    clientId: "client", clientSecret: "secret", redirectUri: "https://example.test/callback",
    frontendUrl: "https://example.test", encryptionSecret: "a-secret-long-enough-for-tests",
  });
  const internals = service as unknown as { decrypt: () => string; accessToken: () => Promise<string>; gmailJson: (token: string, path: string) => Promise<unknown> };
  internals.decrypt = () => "refresh-token";
  internals.accessToken = async () => "token";
  const queries: string[] = [];
  internals.gmailJson = async (_token, path) => {
    if (path.startsWith("/messages?q=")) { queries.push(decodeURIComponent(path)); return { messages: [] }; }
    return {};
  };
  const finance = { findPurchaseDocumentBySha: async () => undefined } as never;
  await service.syncInbox(identity, finance, { dryRun: true, lookbackDays: 30 });
  await service.syncInbox(identity, finance, { dryRun: true });
  assert.equal(sqlLog.filter((sql) => /update gmail_integrations/i.test(sql)).length, 0);
  await service.syncInbox(identity, finance, { lookbackDays: 30 });
  assert.match(queries[0] ?? "", /newer_than:30d/);
  assert.doesNotMatch(queries[1] ?? "", /newer_than:30d/);
  assert.match(queries[2] ?? "", /newer_than:/);
  assert.equal(sqlLog.filter((sql) => /update gmail_integrations/i.test(sql)).length, 1);
});

test("lookbackDays valida límites enteros", async () => {
  const { parseGmailDryRunOptions } = await import("../src/integrations/gmail-routes.js");
  assert.deepEqual(parseGmailDryRunOptions({}), { dryRun: true });
  assert.deepEqual(parseGmailDryRunOptions({ lookbackDays: 30 }), { dryRun: true, lookbackDays: 30 });
  for (const value of [0, 31, 1.5, "30", null]) {
    assert.throws(() => parseGmailDryRunOptions({ lookbackDays: value }), /invalid_request/);
  }
});
