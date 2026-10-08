import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../src/api/client";
import {
  contactsApi,
  authApi,
  deliveryNotesApi,
  financeApi,
  importsApi,
  invoicesApi,
  pricingApi,
  productsApi,
} from "../src/api/services";

afterEach(() => vi.restoreAllMocks());

describe("contratos de catálogo", () => {
  it("lista, crea, edita y da de baja contactos sin company_id", async () => {
    const request = vi.spyOn(apiClient, "request").mockResolvedValue({});
    const input = { type: "customer" as const, legalName: "Empresa ficticia", tradeName: null, taxId: null, email: null, phone: null, address: {}, notes: null };
    await contactsApi.list({ search: "Empresa", page: 1, pageSize: 20 });
    await contactsApi.create(input);
    await contactsApi.update("contact-id", { legalName: "Empresa editada" });
    await contactsApi.deactivate("contact-id");
    expect(request).toHaveBeenNthCalledWith(1, "/contacts?search=Empresa&page=1&pageSize=20");
    expect(request).toHaveBeenNthCalledWith(2, "/contacts", { method: "POST", body: JSON.stringify(input) });
    expect(request).toHaveBeenNthCalledWith(3, "/contacts/contact-id", { method: "PATCH", body: JSON.stringify({ legalName: "Empresa editada" }) });
    expect(request).toHaveBeenNthCalledWith(4, "/contacts/contact-id", { method: "DELETE" });
    expect(request.mock.calls.flat().join(" ")).not.toMatch(/company_?id/i);
  });

  it("lista, crea, edita y da de baja productos conservando decimales como texto", async () => {
    const request = vi.spyOn(apiClient, "request").mockResolvedValue({});
    const input = { name: "Producto ficticio", description: null, sku: "TEST-1", unit: "kg" as const, salePrice: "12.3456", estimatedCost: "8.0001", taxRate: "4" };
    await productsApi.list({ isActive: true });
    await productsApi.create(input);
    await productsApi.update("product-id", { salePrice: "13.0001" });
    await productsApi.deactivate("product-id");
    expect(request).toHaveBeenNthCalledWith(1, "/products?isActive=true");
    expect(request.mock.calls[1]?.[1]).toMatchObject({ body: expect.stringContaining("12.3456") });
    expect(request).toHaveBeenNthCalledWith(4, "/products/product-id", { method: "DELETE" });
  });

  it("gestiona precio específico y fallback mediante los endpoints existentes", async () => {
    const request = vi.spyOn(apiClient, "request").mockResolvedValue({});
    await pricingApi.list("contact-id", { pageSize: 100 });
    await pricingApi.upsert("contact-id", "product-id", { price: "10.5001", validFrom: "2026-07-15", isActive: true });
    await pricingApi.deactivate("contact-id", "product-id");
    expect(request).toHaveBeenNthCalledWith(1, "/contacts/contact-id/products?pageSize=100");
    expect(request).toHaveBeenNthCalledWith(3, "/contacts/contact-id/products/product-id/price", { method: "DELETE" });
  });
});

describe("contratos de importación", () => {
  it("valida, confirma con estrategia explícita y cancela", async () => {
    const request = vi.spyOn(apiClient, "request").mockResolvedValue({});
    await importsApi.validate({ entityType: "contacts", sourceFormat: "csv", content: "legalName\nEjemplo" });
    await importsApi.confirm("batch-id", "skip_existing");
    await importsApi.cancel("batch-id");
    expect(request).toHaveBeenNthCalledWith(1, "/imports/validate", expect.objectContaining({ method: "POST", timeoutMs: 30_000 }));
    expect(request).toHaveBeenNthCalledWith(2, "/imports/batch-id/confirm", { method: "POST", body: JSON.stringify({ strategy: "skip_existing" }), timeoutMs: 30_000 });
    expect(request).toHaveBeenNthCalledWith(3, "/imports/batch-id/cancel", { method: "POST", body: "{}" });
  });
});

describe("contratos operativos", () => {
  it("actualiza líneas de factura con PATCH y conserva los decimales", async () => {
    const request = vi.spyOn(apiClient, "request").mockResolvedValue({});
    const input = {
      productId: "product-id",
      description: "Patata nueva",
      quantity: "3.5000",
      unit: "kg" as const,
      unitPrice: "9.8765",
      taxRate: "4.0000",
      position: 2,
      deliveryDate: "2026-07-14",
    };
    await invoicesApi.updateLine("invoice-id", "line-id", input);
    expect(request).toHaveBeenCalledWith(
      "/invoices/invoice-id/lines/line-id",
      { method: "PATCH", body: JSON.stringify(input) },
    );
  });

  it("archiva justificantes sin activar ningún lector automático", async () => {
    const request = vi.spyOn(apiClient, "request").mockResolvedValue({});
    await financeApi.archivePurchaseDocument({
      filename: "factura.pdf",
      mimeType: "application/pdf",
      contentBase64: "JVBERi0=",
    });
    expect(request).toHaveBeenCalledWith(
      "/purchase-documents",
      expect.objectContaining({
        method: "POST",
        timeoutMs: 30_000,
      }),
    );
  });

  it("usa el endpoint fiscal que solo devuelve compras confirmadas", async () => {
    const request = vi.spyOn(apiClient, "request").mockResolvedValue([]);
    await financeApi.confirmedPurchasesForExport("2026-01-01", "2026-12-31");
    expect(request).toHaveBeenCalledWith(
      "/purchases/export?from=2026-01-01&to=2026-12-31",
    );
  });

  it("permite cambiar contraseña y cerrar otras sesiones", async () => {
    const request = vi.spyOn(apiClient, "request").mockResolvedValue({});
    await authApi.changePassword("actual-segura", "nueva-muy-segura");
    await authApi.revokeOtherSessions();
    expect(request).toHaveBeenNthCalledWith(1, "/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: "actual-segura",
        newPassword: "nueva-muy-segura",
      }),
    });
    expect(request).toHaveBeenNthCalledWith(
      2,
      "/auth/sessions/revoke-others",
      { method: "POST", body: "{}" },
    );
  });
});

describe("contratos de albaranes", () => {
  it("edita, borra y corrige líneas de un albarán con precio editable", async () => {
    const request = vi.spyOn(apiClient, "request").mockResolvedValue({});
    await deliveryNotesApi.update("n1", { issueDate: "2026-10-08", notes: "Cámara trasera" });
    await deliveryNotesApi.updateLine("n1", "l1", { quantity: "12", unitPrice: "1.2" });
    await deliveryNotesApi.addLine("n1", { productId: "p1", quantity: "5", unitPrice: "1.1" });
    await deliveryNotesApi.delete("n1");
    expect(request).toHaveBeenNthCalledWith(1, "/delivery-notes/n1", { method: "PATCH", body: JSON.stringify({ issueDate: "2026-10-08", notes: "Cámara trasera" }) });
    expect(request).toHaveBeenNthCalledWith(2, "/delivery-notes/n1/lines/l1", { method: "PATCH", body: JSON.stringify({ quantity: "12", unitPrice: "1.2" }) });
    expect(request.mock.calls[2]?.[1]).toMatchObject({ method: "POST", body: expect.stringContaining('"unitPrice":"1.1"') });
    expect(request).toHaveBeenNthCalledWith(4, "/delivery-notes/n1", { method: "DELETE" });
  });

  it("pide número sugerido, repetir último y PDF con o sin precios", async () => {
    const request = vi.spyOn(apiClient, "request").mockResolvedValue({});
    const download = vi.spyOn(apiClient, "download").mockResolvedValue(new Blob());
    await deliveryNotesApi.numberPreview("ALB_2026");
    await deliveryNotesApi.fromLast({ contactId: "c1", series: "ALB_2026", issueDate: "2026-10-08" });
    await deliveryNotesApi.downloadPdf("n1");
    await deliveryNotesApi.downloadPdf("n1", { prices: false, copies: 2 });
    expect(request).toHaveBeenNthCalledWith(1, "/delivery-notes/number-preview?series=ALB_2026");
    expect(request.mock.calls[1]?.[0]).toBe("/delivery-notes/from-last");
    expect(download).toHaveBeenNthCalledWith(1, "/delivery-notes/n1/pdf?prices=1&copies=1");
    expect(download).toHaveBeenNthCalledWith(2, "/delivery-notes/n1/pdf?prices=0&copies=2");
  });
});
