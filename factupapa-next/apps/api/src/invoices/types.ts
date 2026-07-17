import type { ProductUnit } from "../products/types.js";
export type InvoiceState = "draft" | "issued" | "cancelled";
export interface InvoiceLine {
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
export interface Invoice {
  id: string;
  contactId: string;
  number: number | null;
  series: string;
  issueDate: string;
  dueDate: string | null;
  operationStartDate?: string | null;
  operationEndDate?: string | null;
  deliveryDates?: string[];
  paymentTerms?: string | null;
  generalInformation?: string | null;
  status: InvoiceState;
  notes: string | null;
  subtotal: string;
  taxTotal: string;
  total: string;
  sourceType: "manual" | "delivery_notes";
  contactLegalName: string;
  contactTaxId: string | null;
  contactAddress: Record<string, string>;
  issuerLegalName: string;
  issuerTaxId: string | null;
  issuerAddress: Record<string, string>;
  issuedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lines: InvoiceLine[];
  deliveryNoteIds: string[];
}
export interface InvoiceCreate {
  contactId: string;
  series: string;
  issueDate: string;
  dueDate?: string | null | undefined;
  notes?: string | null | undefined;
  operationStartDate?: string | null;
  operationEndDate?: string | null;
  deliveryDates?: string[];
  paymentTerms?: string | null;
  generalInformation?: string | null;
}
export type InvoicePatch = Partial<InvoiceCreate>;
export interface InvoiceLineInput {
  productId?: string | null;
  description?: string;
  quantity: string;
  unit?: ProductUnit;
  unitPrice?: string;
  taxRate?: string;
  position?: number;
}
