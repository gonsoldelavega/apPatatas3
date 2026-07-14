import { HttpError } from "../http/errors.js";
import { assertAllowedKeys, decimalString, listQuery, optionalBoolean, optionalText, requiredText, taxRate } from "../domain/validation.js";
import type { ProductCreate, ProductListQuery, ProductPatch, ProductUnit } from "./types.js";

const fields = ["name", "description", "sku", "unit", "salePrice", "estimatedCost", "taxRate", "isActive"] as const;

function unit(value: unknown): ProductUnit {
  if (value !== "kg" && value !== "g" && value !== "unit" && value !== "box" && value !== "custom") {
    throw new HttpError("invalid_request", 400);
  }
  return value;
}

function nullableMoney(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value;
  return decimalString(value, 10, 4);
}

export function validateProductCreate(body: Record<string, unknown>): ProductCreate {
  assertAllowedKeys(body, fields);
  const description = optionalText(body.description, 4000);
  const sku = optionalText(body.sku, 64);
  const estimatedCost = nullableMoney(body.estimatedCost);
  return {
    name: requiredText(body.name, 200),
    ...(description === undefined ? {} : { description }),
    ...(sku === undefined ? {} : { sku }),
    unit: unit(body.unit),
    salePrice: decimalString(body.salePrice, 10, 4),
    ...(estimatedCost === undefined ? {} : { estimatedCost }),
    taxRate: taxRate(body.taxRate),
  };
}

export function validateProductPatch(body: Record<string, unknown>): ProductPatch {
  assertAllowedKeys(body, fields, true);
  const result: ProductPatch = {};
  if (body.name !== undefined) result.name = requiredText(body.name, 200);
  const description = optionalText(body.description, 4000);
  if (description !== undefined) result.description = description;
  const sku = optionalText(body.sku, 64);
  if (sku !== undefined) result.sku = sku;
  if (body.unit !== undefined) result.unit = unit(body.unit);
  if (body.salePrice !== undefined) result.salePrice = decimalString(body.salePrice, 10, 4);
  const estimatedCost = nullableMoney(body.estimatedCost);
  if (estimatedCost !== undefined) result.estimatedCost = estimatedCost;
  if (body.taxRate !== undefined) result.taxRate = taxRate(body.taxRate);
  const isActive = optionalBoolean(body.isActive);
  if (isActive !== undefined) result.isActive = isActive;
  return result;
}

export function validateProductList(url: URL): ProductListQuery {
  if (url.searchParams.has("type")) throw new HttpError("invalid_request", 400);
  return listQuery(url, ["name", "createdAt", "updatedAt", "salePrice"]);
}
