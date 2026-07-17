import type { Address, ListQuery } from "../domain/validation.js";

export type ContactType = "customer" | "supplier" | "both";

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
  paymentTermsDays: number;
  paymentTermsText: string | null;
  defaultInvoiceInformation: string | null;
  applyInvoiceDefaults: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactCreate {
  type: ContactType;
  legalName: string;
  tradeName?: string | null;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: Address;
  notes?: string | null;
  paymentTermsDays?: number;
  paymentTermsText?: string | null;
  defaultInvoiceInformation?: string | null;
  applyInvoiceDefaults?: boolean;
}

export type ContactPatch = Partial<ContactCreate & { isActive: boolean }>;
export interface ContactListQuery extends ListQuery {
  type?: ContactType;
}
