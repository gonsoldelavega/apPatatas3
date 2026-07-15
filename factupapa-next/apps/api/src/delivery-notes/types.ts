import type { ProductUnit } from "../products/types.js";
export type DeliveryNoteStatus = "draft" | "issued" | "invoiced" | "cancelled";
export interface DeliveryLine {
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
  status: DeliveryNoteStatus;
  notes: string | null;
  subtotal: string;
  taxTotal: string;
  total: string;
  createdAt: Date;
  updatedAt: Date;
  issuedAt: Date | null;
  cancelledAt: Date | null;
  lines: DeliveryLine[];
}
export interface DeliveryCreate {
  contactId: string;
  series: string;
  issueDate: string;
  notes?: string | null | undefined;
}
export interface DeliveryPatch {
  contactId?: string;
  series?: string;
  issueDate?: string;
  notes?: string | null | undefined;
}
export interface DeliveryLineInput {
  productId?: string | null;
  description?: string;
  quantity: string;
  unit?: ProductUnit;
  unitPrice?: string;
  taxRate?: string;
  position?: number;
}
