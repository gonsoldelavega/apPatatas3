import type { ListQuery } from "../domain/validation.js";
import type { Margin } from "../domain/money.js";
import type { ProductUnit } from "../products/types.js";

export interface PriceInput {
  price: string;
  validFrom?: string;
  isActive?: boolean;
}

export interface ContactProductPrice {
  id: string;
  contactId: string;
  productId: string;
  price: string;
  validFrom: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

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

export type EffectiveProductQuery = ListQuery;
