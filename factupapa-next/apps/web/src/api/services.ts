import { apiClient } from "./client";
import type {
  Contact, ContactInput, ContactType, CurrentUser, EffectiveProduct, ImportBatch, ImportEntityType,
  ImportPreview, ImportSourceFormat, ImportStrategy, Page, Product, ProductInput
} from "./types";

function queryString(values: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const authApi = {
  me: () => apiClient.request<CurrentUser>("/me"),
  login: (email: string, password: string) => apiClient.login(email, password),
  logout: () => apiClient.logout(),
  refresh: () => apiClient.refresh()
};

export const contactsApi = {
  list: (params: { search?: string; type?: ContactType; isActive?: boolean; page?: number; pageSize?: number }) =>
    apiClient.request<Page<Contact>>(`/contacts${queryString(params)}`),
  get: (id: string) => apiClient.request<Contact>(`/contacts/${id}`),
  create: (input: ContactInput) => apiClient.request<Contact>("/contacts", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: Partial<ContactInput> & { isActive?: boolean }) =>
    apiClient.request<Contact>(`/contacts/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deactivate: (id: string) => apiClient.request<void>(`/contacts/${id}`, { method: "DELETE" })
};

export const productsApi = {
  list: (params: { search?: string; isActive?: boolean; page?: number; pageSize?: number }) =>
    apiClient.request<Page<Product>>(`/products${queryString(params)}`),
  get: (id: string) => apiClient.request<Product>(`/products/${id}`),
  create: (input: ProductInput) => apiClient.request<Product>("/products", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: Partial<ProductInput> & { isActive?: boolean }) =>
    apiClient.request<Product>(`/products/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deactivate: (id: string) => apiClient.request<void>(`/products/${id}`, { method: "DELETE" })
};

export const pricingApi = {
  list: (contactId: string, params: { search?: string; page?: number; pageSize?: number }) =>
    apiClient.request<Page<EffectiveProduct>>(`/contacts/${contactId}/products${queryString(params)}`),
  upsert: (contactId: string, productId: string, input: { price: string; validFrom?: string; isActive?: boolean }) =>
    apiClient.request(`/contacts/${contactId}/products/${productId}/price`, { method: "PUT", body: JSON.stringify(input) }),
  deactivate: (contactId: string, productId: string) =>
    apiClient.request<void>(`/contacts/${contactId}/products/${productId}/price`, { method: "DELETE" })
};

export const importsApi = {
  validate: (input: { entityType: ImportEntityType; sourceFormat: ImportSourceFormat; content: string }) =>
    apiClient.request<ImportPreview>("/imports/validate", { method: "POST", body: JSON.stringify(input), timeoutMs: 30_000 }),
  list: (page = 1, pageSize = 25) => apiClient.request<Page<ImportBatch>>(`/imports${queryString({ page, pageSize })}`),
  get: (id: string) => apiClient.request<ImportPreview>(`/imports/${id}`),
  confirm: (id: string, strategy: ImportStrategy) =>
    apiClient.request(`/imports/${id}/confirm`, { method: "POST", body: JSON.stringify({ strategy }), timeoutMs: 30_000 }),
  cancel: (id: string) => apiClient.request<void>(`/imports/${id}/cancel`, { method: "POST", body: "{}" })
};
