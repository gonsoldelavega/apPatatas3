import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../src/api/client";
import { contactsApi, importsApi, pricingApi, productsApi } from "../src/api/services";

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
