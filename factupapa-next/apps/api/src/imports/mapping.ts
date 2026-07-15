import { HttpError } from "../http/errors.js";
import { decodeUtf8, parseCsvRecords, sourceBytes } from "./parser.js";
import type { ImportEntityType, ImportSourceFormat, ValidateImportInput } from "./types.js";

export const fields: Record<ImportEntityType, { key: string; label: string; required: boolean; aliases: string[] }[]> = {
  contacts: [
    { key: "type", label: "Tipo", required: true, aliases: ["type", "tipo"] },
    { key: "legalName", label: "Razón social", required: true, aliases: ["legal_name", "legalname", "razon_social", "nombre"] },
    { key: "tradeName", label: "Nombre comercial", required: false, aliases: ["trade_name", "tradename", "nombre_comercial"] },
    { key: "taxId", label: "NIF/CIF", required: false, aliases: ["tax_id", "taxid", "nif", "cif"] },
    { key: "email", label: "Email", required: false, aliases: ["email", "correo"] },
    { key: "phone", label: "Teléfono", required: false, aliases: ["phone", "telefono"] },
    { key: "address", label: "Dirección estructurada", required: false, aliases: ["address", "direccion"] },
    { key: "addressStreet", label: "Calle", required: false, aliases: ["address_street", "calle"] },
    { key: "addressLine2", label: "Dirección adicional", required: false, aliases: ["address_line2", "direccion_2"] },
    { key: "postalCode", label: "Código postal", required: false, aliases: ["postal_code", "codigopostal", "cp"] },
    { key: "city", label: "Ciudad", required: false, aliases: ["city", "ciudad", "localidad"] },
    { key: "province", label: "Provincia", required: false, aliases: ["province", "provincia"] },
    { key: "country", label: "País", required: false, aliases: ["country", "pais"] },
    { key: "notes", label: "Notas", required: false, aliases: ["notes", "notas"] },
    { key: "isActive", label: "Activo", required: false, aliases: ["is_active", "isactive", "activo"] },
  ],
  products: [
    { key: "name", label: "Nombre", required: true, aliases: ["name", "nombre", "producto"] },
    { key: "description", label: "Descripción", required: false, aliases: ["description", "descripcion"] },
    { key: "sku", label: "Referencia", required: false, aliases: ["sku", "referencia", "codigo"] },
    { key: "unit", label: "Unidad", required: true, aliases: ["unit", "unidad"] },
    { key: "salePrice", label: "Precio de venta", required: true, aliases: ["sale_price", "saleprice", "precio", "precio_venta"] },
    { key: "estimatedCost", label: "Coste estimado", required: false, aliases: ["estimated_cost", "estimatedcost", "coste"] },
    { key: "taxRate", label: "IVA", required: true, aliases: ["tax_rate", "taxrate", "iva"] },
    { key: "isActive", label: "Activo", required: false, aliases: ["is_active", "isactive", "activo"] },
  ],
  contact_product_prices: [
    { key: "taxId", label: "NIF/CIF del cliente", required: true, aliases: ["tax_id", "taxid", "nif", "cif"] },
    { key: "sku", label: "Referencia", required: true, aliases: ["sku", "referencia", "codigo"] },
    { key: "price", label: "Precio", required: true, aliases: ["price", "precio"] },
    { key: "validFrom", label: "Válido desde", required: false, aliases: ["valid_from", "validfrom", "desde"] },
    { key: "isActive", label: "Activo", required: false, aliases: ["is_active", "isactive", "activo"] },
  ],
};

function canonical(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function normalizeMapping(entityType: ImportEntityType, columns: string[], value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError("invalid_mapping", 400);
  const mapping = Object.fromEntries(Object.entries(value).map(([target, source]) => {
    if (typeof source !== "string" || !source.trim()) throw new HttpError("invalid_mapping", 400);
    return [target, source.trim()];
  }));
  const allowed = new Set(fields[entityType].map((field) => field.key));
  if (Object.keys(mapping).some((key) => !allowed.has(key) || key === "companyId" || key === "company_id")) throw new HttpError("invalid_mapping", 400);
  const sources = Object.values(mapping);
  if (new Set(sources).size !== sources.length || sources.some((source) => !columns.includes(source))) throw new HttpError("invalid_mapping", 400);
  if (fields[entityType].some((field) => field.required && !mapping[field.key])) throw new HttpError("missing_required_mapping", 400);
  return Object.fromEntries(Object.entries(mapping).sort(([a], [b]) => a.localeCompare(b)));
}

export function proposeMapping(entityType: ImportEntityType, columns: string[]): { mapping: Record<string, string>; ambiguities: string[] } {
  const mapping: Record<string, string> = {};
  const ambiguities: string[] = [];
  for (const field of fields[entityType]) {
    const matches = columns.filter((column) => field.aliases.includes(canonical(column)) || canonical(column) === canonical(field.key));
    if (matches.length === 1) mapping[field.key] = matches[0]!;
    else if (matches.length > 1) ambiguities.push(field.key);
  }
  return { mapping, ambiguities };
}

export function applyMapping(rows: Record<string, unknown>[], mapping: Record<string, string>): Record<string, unknown>[] {
  return rows.map((row) => {
    const mapped = Object.fromEntries(Object.entries(mapping).map(([target, source]) => [target, row[source]]));
    const address = mapped.address && typeof mapped.address === "object" && !Array.isArray(mapped.address) ? mapped.address as Record<string, unknown> : {};
    for (const [source, target] of [["addressStreet", "street"], ["addressLine2", "line2"], ["postalCode", "postalCode"], ["city", "city"], ["province", "province"], ["country", "country"]] as const) {
      if (mapped[source] !== undefined && mapped[source] !== "") address[target] = mapped[source];
      delete mapped[source];
    }
    if (Object.keys(address).length) mapped.address = address; else delete mapped.address;
    return mapped;
  });
}

export function detectColumns(input: Pick<ValidateImportInput, "content" | "contentBase64" | "entityType" | "sourceFormat">) {
  const text = decodeUtf8(sourceBytes(input));
  let columns: string[];
  if (input.sourceFormat === "csv") {
    columns = (parseCsvRecords(text)[0] ?? []).map((column) => column.trim());
  } else {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new HttpError("invalid_request", 400); }
    const rows = Array.isArray(parsed) ? parsed : (parsed as { rows?: unknown } | null)?.rows;
    if (!Array.isArray(rows) || !rows[0] || typeof rows[0] !== "object" || Array.isArray(rows[0])) throw new HttpError("invalid_request", 400);
    columns = [...new Set(rows.flatMap((row) => row && typeof row === "object" && !Array.isArray(row) ? Object.keys(row) : []))];
  }
  if (!columns.length || columns.some((column) => !column)) throw new HttpError("invalid_request", 400);
  const duplicates = columns.filter((column, index) => columns.indexOf(column) !== index);
  const proposed = proposeMapping(input.entityType, columns);
  const knownSources = new Set(Object.values(proposed.mapping));
  return {
    columns: [...new Set(columns)],
    proposedMapping: proposed.mapping,
    requiredFields: fields[input.entityType].filter((field) => field.required).map((field) => field.key),
    fields: fields[input.entityType].map(({ aliases: _aliases, ...field }) => field),
    duplicateColumns: [...new Set(duplicates)],
    unknownColumns: [...new Set(columns)].filter((column) => !knownSources.has(column)),
    ambiguities: proposed.ambiguities,
    valid: duplicates.length === 0 && proposed.ambiguities.length === 0 && fields[input.entityType].every((field) => !field.required || proposed.mapping[field.key]),
  };
}
