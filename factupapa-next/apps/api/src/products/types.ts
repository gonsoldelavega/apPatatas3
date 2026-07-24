import type { ListQuery } from "../domain/validation.js";
import type { Margin } from "../domain/money.js";

export type ProductUnit = "kg" | "g" | "unit" | "box" | "custom";
export type PackageKind = "none" | "bag" | "box" | "sack" | "tray" | "custom";

export interface ProductRecord {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  unit: ProductUnit;
  salePrice: string;
  estimatedCost: string | null;
  packageKind: PackageKind;
  packageLabel: string | null;
  unitsPerPackage: string | null;
  packageCost: string | null;
  expectedLossRate: string;
  taxRate: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Product extends ProductRecord { margin: Margin | null }

export interface ProductCreate {
  name: string;
  description?: string | null;
  sku?: string | null;
  unit: ProductUnit;
  salePrice: string;
  estimatedCost?: string | null;
  packageKind?: PackageKind;
  packageLabel?: string | null;
  unitsPerPackage?: string | null;
  packageCost?: string | null;
  expectedLossRate?: string;
  taxRate: string;
}

export type ProductPatch = Partial<ProductCreate & { isActive: boolean }>;
export type ProductListQuery = ListQuery;
