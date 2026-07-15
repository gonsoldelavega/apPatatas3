export type ContactType = "customer" | "supplier" | "both";
export type ProductUnit = "kg" | "g" | "unit" | "box" | "custom";
export type ImportEntityType =
  "contacts" | "products" | "contact_product_prices";
export type ImportSourceFormat = "csv" | "json";
export type ImportStatus =
  "pending" | "validated" | "importing" | "completed" | "failed" | "cancelled";
export type ImportStrategy =
  "skip_existing" | "update_existing" | "fail_on_conflict";

export interface Address {
  street?: string;
  line2?: string;
  postalCode?: string;
  city?: string;
  province?: string;
  country?: string;
}

export interface Contact {
  id: string;
  type: ContactType;
  legalName: string;
  tradeName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: Address;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ContactInput = Omit<
  Contact,
  "id" | "isActive" | "createdAt" | "updatedAt"
>;

export interface Margin {
  amount: string;
  percentage: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  unit: ProductUnit;
  salePrice: string;
  estimatedCost: string | null;
  taxRate: string;
  margin: Margin | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ProductInput = Omit<
  Product,
  "id" | "margin" | "isActive" | "createdAt" | "updatedAt"
>;

export interface EffectiveProduct {
  id: string;
  name: string;
  sku: string | null;
  unit: ProductUnit;
  salePrice: string;
  specificPrice: string | null;
  effectivePrice: string;
  taxRate: string;
  margin: Margin | null;
}

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  company: { id: string; name: string };
  membership: { role: string };
}

export interface AuthTokens {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ImportRow {
  rowNumber: number;
  classification:
    "new" | "possible_update" | "duplicate" | "conflict" | "error";
  proposedAction: "create" | "update" | "skip" | "reject";
  normalizedData: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

export interface ImportBatch {
  id: string;
  entityType: ImportEntityType;
  sourceFormat: ImportSourceFormat;
  status: ImportStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  validationSummary: Record<string, unknown>;
  mappingUsed?: Record<string, string>;
  createdAt: string;
  validatedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
}

export interface ImportPreview extends ImportBatch {
  rows: ImportRow[];
  reused: boolean;
}

export interface ImportColumnDetection {
  columns: string[];
  proposedMapping: Record<string, string>;
  requiredFields: string[];
  fields: { key: string; label: string; required: boolean }[];
  duplicateColumns: string[];
  unknownColumns: string[];
  ambiguities: string[];
  valid: boolean;
}

export interface ImportMapping {
  id: string;
  name: string;
  entityType: ImportEntityType;
  sourceFormat: ImportSourceFormat;
  mapping: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface SalesLine {
  id: string;
  productId: string | null;
  description: string;
  quantity: string;
  unit: ProductUnit;
  unitPrice: string;
  taxRate: string;
  lineSubtotal: string;
  lineTax: string;
  lineTotal: string;
  position: number;
}
export interface DeliveryNote {
  id: string;
  contactId: string;
  number: number | null;
  series: string;
  issueDate: string;
  status: "draft" | "issued" | "invoiced" | "cancelled";
  notes: string | null;
  subtotal: string;
  taxTotal: string;
  total: string;
  lines?: SalesLine[];
}
export interface Invoice {
  id: string;
  contactId: string;
  number: number | null;
  series: string;
  issueDate: string;
  dueDate: string | null;
  status: "draft" | "issued" | "cancelled";
  notes: string | null;
  subtotal: string;
  taxTotal: string;
  total: string;
  sourceType: "manual" | "delivery_notes";
  contactLegalName: string;
  contactTaxId: string | null;
  contactAddress: Address;
  lines?: SalesLine[];
  deliveryNoteIds?: string[];
}
