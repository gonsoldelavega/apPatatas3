import { createHash } from "node:crypto";
import { validateContactCreate } from "../contacts/validation.js";
import { assertAllowedKeys, optionalBoolean, optionalTaxId } from "../domain/validation.js";
import { HttpError } from "../http/errors.js";
import { validatePrice } from "../pricing/validation.js";
import { validateProductCreate } from "../products/validation.js";
import type { ImportEntityType, ImportRowDraft, ImportSourceFormat, ImportStrategy, ValidateImportInput } from "./types.js";
import { sourceFormat } from "./parser.js";

const csvFields = {
  contacts: ["type", "legal_name", "trade_name", "tax_id", "email", "phone", "address_street", "address_line2", "postal_code", "city", "province", "country", "notes", "is_active"],
  products: ["name", "description", "sku", "unit", "sale_price", "estimated_cost", "tax_rate", "is_active"],
  contact_product_prices: ["tax_id", "sku", "price", "valid_from", "is_active"],
} as const;

const jsonFields = {
  contacts: ["type", "legalName", "tradeName", "taxId", "email", "phone", "address", "notes", "isActive"],
  products: ["name", "description", "sku", "unit", "salePrice", "estimatedCost", "taxRate", "isActive"],
  contact_product_prices: ["taxId", "sku", "price", "validFrom", "isActive"],
} as const;

export function validateImportRequest(body: Record<string, unknown>): ValidateImportInput {
  assertAllowedKeys(body, ["entityType", "sourceFormat", "content", "contentBase64", "mappingId", "mapping"]);
  const entityType = body.entityType;
  if (entityType !== "contacts" && entityType !== "products" && entityType !== "contact_product_prices") {
    throw new HttpError("invalid_request", 400);
  }
  if (body.content !== undefined && typeof body.content !== "string") throw new HttpError("invalid_request", 400);
  if (body.contentBase64 !== undefined && typeof body.contentBase64 !== "string") throw new HttpError("invalid_request", 400);
  if (body.mappingId !== undefined && (typeof body.mappingId !== "string" || body.mapping !== undefined)) throw new HttpError("invalid_request", 400);
  if (body.mapping !== undefined && (!body.mapping || typeof body.mapping !== "object" || Array.isArray(body.mapping))) throw new HttpError("invalid_request", 400);
  return {
    entityType,
    sourceFormat: sourceFormat(body.sourceFormat),
    ...(body.content === undefined ? {} : { content: body.content }),
    ...(body.contentBase64 === undefined ? {} : { contentBase64: body.contentBase64 }),
    ...(body.mappingId === undefined ? {} : { mappingId: body.mappingId }),
    ...(body.mapping === undefined ? {} : { mapping: body.mapping as Record<string, string> }),
  };
}

function bool(value: unknown): boolean | undefined {
  if (value === "") return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return optionalBoolean(value);
}

function blank(value: unknown): unknown {
  return value === "" ? undefined : value;
}

function checkKeys(row: Record<string, unknown>, entityType: ImportEntityType, format: ImportSourceFormat): void {
  assertAllowedKeys(row, format === "csv" ? csvFields[entityType] : jsonFields[entityType]);
}

function contact(row: Record<string, unknown>, format: ImportSourceFormat): Record<string, unknown> {
  const mapped = format === "csv" ? {
    type: row.type, legalName: row.legal_name, tradeName: blank(row.trade_name), taxId: blank(row.tax_id),
    email: blank(row.email), phone: blank(row.phone), notes: blank(row.notes),
    address: Object.fromEntries([
      ["street", row.address_street], ["line2", row.address_line2], ["postalCode", row.postal_code],
      ["city", row.city], ["province", row.province], ["country", row.country],
    ].filter(([, value]) => value !== "" && value !== undefined)),
  } : { ...row };
  const isActive = bool(format === "csv" ? row.is_active : row.isActive);
  const value = validateContactCreate(mapped);
  return { ...value, isActive: isActive ?? true };
}

function product(row: Record<string, unknown>, format: ImportSourceFormat): Record<string, unknown> {
  const mapped: Record<string, unknown> = format === "csv" ? {
    name: row.name, description: blank(row.description), sku: blank(row.sku), unit: row.unit,
    salePrice: row.sale_price, estimatedCost: blank(row.estimated_cost), taxRate: row.tax_rate,
  } : { ...row };
  const isActive = bool(format === "csv" ? row.is_active : row.isActive);
  delete mapped.isActive;
  const value = validateProductCreate(mapped);
  return {
    ...value,
    salePrice: mapped.salePrice as string,
    ...(typeof mapped.estimatedCost === "string" ? { estimatedCost: mapped.estimatedCost } : {}),
    taxRate: mapped.taxRate as string,
    isActive: isActive ?? true,
  };
}

function price(row: Record<string, unknown>, format: ImportSourceFormat): Record<string, unknown> {
  const mapped = format === "csv" ? {
    taxId: row.tax_id, sku: row.sku, price: row.price, validFrom: blank(row.valid_from), isActive: bool(row.is_active),
  } : { ...row };
  assertAllowedKeys(mapped, ["taxId", "sku", "price", "validFrom", "isActive"]);
  const taxId = optionalTaxId(mapped.taxId);
  if (!taxId) throw new HttpError("invalid_request", 400);
  if (typeof mapped.sku !== "string" || !mapped.sku.trim() || mapped.sku.trim().length > 64) throw new HttpError("invalid_request", 400);
  const validated = validatePrice({ price: mapped.price, validFrom: mapped.validFrom, isActive: mapped.isActive });
  return { taxId, sku: mapped.sku.trim(), ...validated, price: mapped.price as string, isActive: validated.isActive ?? true };
}

export function normalizeRows(entityType: ImportEntityType, format: ImportSourceFormat, rows: Record<string, unknown>[]): ImportRowDraft[] {
  if (rows.some((row) => "companyId" in row || "company_id" in row)) throw new HttpError("invalid_request", 400);
  if (format === "csv") checkKeys(rows[0]!, entityType, format);
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const warnings = Object.values(row).some((value) => typeof value === "string" && /^[=+\-@]/.test(value.trimStart()))
      ? ["formula_like_value_escaped_in_preview"] : [];
    try {
      checkKeys(row, entityType, format);
      const normalizedData = entityType === "contacts" ? contact(row, format)
        : entityType === "products" ? product(row, format) : price(row, format);
      const identity = entityType === "contacts" ? normalizedData.taxId
        : entityType === "products" ? normalizedData.sku
          : `${normalizedData.taxId as string}|${String(normalizedData.sku).toLowerCase()}`;
      const key = typeof identity === "string" && identity ? identity.toLowerCase() : undefined;
      if (key && seen.has(key)) {
        return { rowNumber: index + 1, classification: "duplicate", proposedAction: "reject", normalizedData, errors: ["duplicate_in_file"], warnings };
      }
      if (key) seen.add(key);
      return { rowNumber: index + 1, classification: "new", proposedAction: "create", normalizedData, errors: [], warnings };
    } catch {
      return { rowNumber: index + 1, classification: "error", proposedAction: "reject", normalizedData: {}, errors: ["invalid_row"], warnings };
    }
  });
}

export function checksum(entityType: ImportEntityType, format: ImportSourceFormat, bytes: Buffer, mapping: Record<string, string> = {}): string {
  return createHash("sha256").update(entityType).update("\0").update(format).update("\0").update(JSON.stringify(mapping)).update("\0").update(bytes).digest("hex");
}

export function importStrategy(value: unknown): ImportStrategy {
  if (value !== "skip_existing" && value !== "update_existing" && value !== "fail_on_conflict") {
    throw new HttpError("invalid_request", 400);
  }
  return value;
}

export function safePreview(value: unknown): unknown {
  if (typeof value === "string") return /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value;
  if (Array.isArray(value)) return value.map(safePreview);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, safePreview(item)]));
  return value;
}
