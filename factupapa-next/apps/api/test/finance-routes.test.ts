import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, test } from "node:test";
import { createApp } from "../src/app.js";
import type { AuthApplication } from "../src/auth/service.js";
import type { DatabaseProbe } from "../src/database/client.js";
import { createFinanceRoutes } from "../src/finance/routes.js";
import type { FinanceService } from "../src/finance/service.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

test("POST /purchase-documents ejecuta la extracción y devuelve sus campos", async () => {
  const identity = {
    userId: "11111111-1111-4111-8111-111111111111",
    companyId: "22222222-2222-4222-8222-222222222222",
    familyId: "33333333-3333-4333-8333-333333333333",
    email: "compras@example.test",
    displayName: "Compras",
    companyName: "FactuPapa",
    role: "owner" as const,
  };
  const calls: Array<Record<string, unknown>> = [];
  const auth = {
    authenticate: async () => identity,
  } as unknown as AuthApplication;
  const finance = {
    uploadDocument: async (
      receivedIdentity: typeof identity,
      input: Record<string, unknown>,
    ) => {
      assert.deepEqual(receivedIdentity, identity);
      calls.push(input);
      return {
        id: "44444444-4444-4444-8444-444444444444",
        filename: input.filename,
        mimeType: input.mimeType,
        byteSize: "17",
        status: "needs_review",
        extractedData: {
          supplierName: "Proveedor de prueba",
          total: "131.04",
          source: "pdf_text",
        },
      };
    },
    archiveDocument: async () => {
      assert.fail("la ruta de lectura no debe limitarse a archivar el documento");
    },
  } as unknown as FinanceService;
  const database: DatabaseProbe = {
    check: async () => undefined,
    close: async () => undefined,
  };
  const server = createApp({
    database,
    auth,
    version: "test",
    routes: [createFinanceRoutes(auth, finance)],
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  const response = await fetch(`http://127.0.0.1:${port}/purchase-documents`, {
    method: "POST",
    headers: {
      Authorization: "Bearer access-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename: "factura.pdf",
      mimeType: "application/pdf",
      contentBase64: "JVBERi0=",
    }),
  });

  assert.equal(response.status, 201);
  assert.deepEqual(calls, [
    {
      filename: "factura.pdf",
      mimeType: "application/pdf",
      contentBase64: "JVBERi0=",
      documentId: undefined,
    },
  ]);
  assert.deepEqual(await response.json(), {
    id: "44444444-4444-4444-8444-444444444444",
    filename: "factura.pdf",
    mimeType: "application/pdf",
    byteSize: "17",
    status: "needs_review",
    extractedData: {
      supplierName: "Proveedor de prueba",
      total: "131.04",
      source: "pdf_text",
    },
  });
});

test("DELETE /purchase-documents/:id descarta sin borrar el archivo", async () => {
  const identity = {
    userId: "11111111-1111-4111-8111-111111111111",
    companyId: "22222222-2222-4222-8222-222222222222",
    familyId: "33333333-3333-4333-8333-333333333333",
    email: "compras@example.test",
    displayName: "Compras",
    companyName: "FactuPapa",
    role: "owner" as const,
  };
  const documentId = "44444444-4444-4444-8444-444444444444";
  const rejected: string[] = [];
  const auth = { authenticate: async () => identity } as unknown as AuthApplication;
  const finance = {
    rejectPendingDocument: async (receivedIdentity: typeof identity, id: string) => {
      assert.deepEqual(receivedIdentity, identity);
      rejected.push(id);
    },
  } as unknown as FinanceService;
  const database: DatabaseProbe = {
    check: async () => undefined,
    close: async () => undefined,
  };
  const server = createApp({
    database,
    auth,
    version: "test",
    routes: [createFinanceRoutes(auth, finance)],
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  const response = await fetch(`http://127.0.0.1:${port}/purchase-documents/${documentId}`, {
    method: "DELETE",
    headers: { Authorization: "Bearer access-token" },
  });

  assert.equal(response.status, 204);
  assert.deepEqual(rejected, [documentId]);
});

test("POST /purchase-documents/:id/restore devuelve el documento a revisión", async () => {
  const identity = {
    userId: "11111111-1111-4111-8111-111111111111",
    companyId: "22222222-2222-4222-8222-222222222222",
    familyId: "33333333-3333-4333-8333-333333333333",
    email: "compras@example.test",
    displayName: "Compras",
    companyName: "FactuPapa",
    role: "owner" as const,
  };
  const documentId = "44444444-4444-4444-8444-444444444444";
  const restored: string[] = [];
  const auth = { authenticate: async () => identity } as unknown as AuthApplication;
  const finance = {
    restoreRejectedDocument: async (receivedIdentity: typeof identity, id: string) => {
      assert.deepEqual(receivedIdentity, identity);
      restored.push(id);
    },
  } as unknown as FinanceService;
  const database: DatabaseProbe = {
    check: async () => undefined,
    close: async () => undefined,
  };
  const server = createApp({
    database,
    auth,
    version: "test",
    routes: [createFinanceRoutes(auth, finance)],
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  const response = await fetch(
    `http://127.0.0.1:${port}/purchase-documents/${documentId}/restore`,
    { method: "POST", headers: { Authorization: "Bearer access-token" } },
  );

  assert.equal(response.status, 204);
  assert.deepEqual(restored, [documentId]);
});
