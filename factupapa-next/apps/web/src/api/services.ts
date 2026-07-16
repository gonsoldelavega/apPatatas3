import { apiClient } from "./client";
import type {
  Contact,
  ContactInput,
  ContactType,
  CurrentUser,
  EffectiveProduct,
  ImportBatch,
  ImportEntityType,
  DeliveryNote,
  ImportPreview,
  ImportSourceFormat,
  ImportStrategy,
  ImportColumnDetection,
  ImportMapping,
  Invoice,
  Page,
  Product,
  ProductInput,
  SalesPreferences,
} from "./types";

function queryString(
  values: Record<string, string | number | boolean | undefined>,
): string {
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
  refresh: () => apiClient.refresh(),
};

export const contactsApi = {
  list: (params: {
    search?: string;
    type?: ContactType;
    isActive?: boolean;
    page?: number;
    pageSize?: number;
  }) => apiClient.request<Page<Contact>>(`/contacts${queryString(params)}`),
  get: (id: string) => apiClient.request<Contact>(`/contacts/${id}`),
  create: (input: ContactInput) =>
    apiClient.request<Contact>("/contacts", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (id: string, input: Partial<ContactInput> & { isActive?: boolean }) =>
    apiClient.request<Contact>(`/contacts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deactivate: (id: string) =>
    apiClient.request<void>(`/contacts/${id}`, { method: "DELETE" }),
};

export const productsApi = {
  list: (params: {
    search?: string;
    isActive?: boolean;
    page?: number;
    pageSize?: number;
  }) => apiClient.request<Page<Product>>(`/products${queryString(params)}`),
  get: (id: string) => apiClient.request<Product>(`/products/${id}`),
  create: (input: ProductInput) =>
    apiClient.request<Product>("/products", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (id: string, input: Partial<ProductInput> & { isActive?: boolean }) =>
    apiClient.request<Product>(`/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deactivate: (id: string) =>
    apiClient.request<void>(`/products/${id}`, { method: "DELETE" }),
};

export const pricingApi = {
  list: (
    contactId: string,
    params: { search?: string; page?: number; pageSize?: number },
  ) =>
    apiClient.request<Page<EffectiveProduct>>(
      `/contacts/${contactId}/products${queryString(params)}`,
    ),
  upsert: (
    contactId: string,
    productId: string,
    input: { price: string; validFrom?: string; isActive?: boolean },
  ) =>
    apiClient.request(`/contacts/${contactId}/products/${productId}/price`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deactivate: (contactId: string, productId: string) =>
    apiClient.request<void>(
      `/contacts/${contactId}/products/${productId}/price`,
      { method: "DELETE" },
    ),
};

export const importsApi = {
  validate: (input: {
    entityType: ImportEntityType;
    sourceFormat: ImportSourceFormat;
    content: string;
    mappingId?: string;
    mapping?: Record<string, string>;
  }) =>
    apiClient.request<ImportPreview>("/imports/validate", {
      method: "POST",
      body: JSON.stringify(input),
      timeoutMs: 30_000,
    }),
  list: (page = 1, pageSize = 25) =>
    apiClient.request<Page<ImportBatch>>(
      `/imports${queryString({ page, pageSize })}`,
    ),
  get: (id: string) => apiClient.request<ImportPreview>(`/imports/${id}`),
  confirm: (id: string, strategy: ImportStrategy) =>
    apiClient.request(`/imports/${id}/confirm`, {
      method: "POST",
      body: JSON.stringify({ strategy }),
      timeoutMs: 30_000,
    }),
  cancel: (id: string) =>
    apiClient.request<void>(`/imports/${id}/cancel`, {
      method: "POST",
      body: "{}",
    }),
  detectColumns: (input: { entityType: ImportEntityType; sourceFormat: ImportSourceFormat; content: string }) =>
    apiClient.request<ImportColumnDetection>("/imports/detect-columns", { method: "POST", body: JSON.stringify(input), timeoutMs: 30_000 }),
  mappings: (entityType: ImportEntityType) => apiClient.request<{ items: ImportMapping[] }>(`/import-mappings${queryString({ entityType })}`),
  saveMapping: (input: { name: string; entityType: ImportEntityType; sourceFormat: ImportSourceFormat; mapping: Record<string,string> }) =>
    apiClient.request<ImportMapping>("/import-mappings", { method: "POST", body: JSON.stringify(input) }),
  deleteMapping: (id: string) => apiClient.request<void>(`/import-mappings/${id}`, { method: "DELETE" }),
};

export const deliveryNotesApi = {
  list: (params: Record<string, string | number | boolean | undefined> = {}) =>
    apiClient.request<Page<DeliveryNote>>(
      `/delivery-notes${queryString(params)}`,
    ),
  get: (id: string) => apiClient.request<DeliveryNote>(`/delivery-notes/${id}`),
  create: (input: {
    contactId: string;
    series: string;
    issueDate: string;
    notes?: string | null;
  }) =>
    apiClient.request<DeliveryNote>("/delivery-notes", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  addLine: (id: string, input: { productId: string; quantity: string }) =>
    apiClient.request<DeliveryNote>(`/delivery-notes/${id}/lines`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  issue: (id: string) =>
    apiClient.request<DeliveryNote>(`/delivery-notes/${id}/issue`, {
      method: "POST",
      body: "{}",
    }),
  cancel: (id: string) =>
    apiClient.request<DeliveryNote>(`/delivery-notes/${id}/cancel`, {
      method: "POST",
      body: "{}",
    }),
};

export const invoicesApi = {
  list: (params: Record<string, string | number | boolean | undefined> = {}) =>
    apiClient.request<Page<Invoice>>(`/invoices${queryString(params)}`),
  get: (id: string) => apiClient.request<Invoice>(`/invoices/${id}`),
  create: (input: {
    contactId: string;
    series: string;
    issueDate: string;
    notes?: string | null;
  }) =>
    apiClient.request<Invoice>("/invoices", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  fromDeliveryNotes: (input: {
    deliveryNoteIds: string[];
    series: string;
    issueDate: string;
  }) =>
    apiClient.request<Invoice>("/invoices/from-delivery-notes", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  addLine: (id: string, input: { productId: string; quantity: string }) =>
    apiClient.request<Invoice>(`/invoices/${id}/lines`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  issue: (id: string) =>
    apiClient.request<Invoice>(`/invoices/${id}/issue`, {
      method: "POST",
      body: "{}",
    }),
  cancel: (id: string) =>
    apiClient.request<Invoice>(`/invoices/${id}/cancel`, {
      method: "POST",
      body: "{}",
    }),
  downloadPdf: (id: string) => apiClient.download(`/invoices/${id}/pdf`),
};

export const salesPreferencesApi = {
  get: () => apiClient.request<SalesPreferences>("/sales-preferences"),
  update: (input: SalesPreferences) =>
    apiClient.request<SalesPreferences>("/sales-preferences", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
};
