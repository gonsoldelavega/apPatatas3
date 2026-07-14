import { HttpError } from "../http/errors.js";

export function assertAllowedKeys(body: Record<string, unknown>, allowed: readonly string[], requireAny = false): void {
  const keys = Object.keys(body);
  if (keys.some((key) => !allowed.includes(key)) || (requireAny && keys.length === 0)) {
    throw new HttpError("invalid_request", 400);
  }
}

export function requiredText(value: unknown, maximumLength: number): string {
  if (typeof value !== "string") throw new HttpError("invalid_request", 400);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength) throw new HttpError("invalid_request", 400);
  return normalized;
}

export function optionalText(value: unknown, maximumLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string" || value.length > maximumLength) throw new HttpError("invalid_request", 400);
  const normalized = value.trim();
  return normalized || null;
}

export function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new HttpError("invalid_request", 400);
  return value;
}

export function optionalEmail(value: unknown): string | null | undefined {
  const email = optionalText(value, 320);
  if (email == null) return email;
  const normalized = email.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new HttpError("invalid_request", 400);
  return normalized;
}

export function optionalPhone(value: unknown): string | null | undefined {
  const phone = optionalText(value, 32);
  if (phone == null) return phone;
  if (!/^[+0-9() .-]{6,32}$/.test(phone)) throw new HttpError("invalid_request", 400);
  return phone;
}

export function optionalTaxId(value: unknown): string | null | undefined {
  const taxId = optionalText(value, 32);
  if (taxId == null) return taxId;
  if (!/^[A-Za-z0-9 .\/-]{2,32}$/.test(taxId)) throw new HttpError("invalid_request", 400);
  return taxId.toUpperCase();
}

const addressFields = ["street", "line2", "postalCode", "city", "province", "country"] as const;
export type Address = Partial<Record<(typeof addressFields)[number], string>>;

export function optionalAddress(value: unknown): Address | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError("invalid_request", 400);
  const record = value as Record<string, unknown>;
  assertAllowedKeys(record, addressFields);
  const result: Address = {};
  for (const field of addressFields) {
    const item = record[field];
    if (item === undefined) continue;
    const maximum = field === "country" ? 2 : field === "postalCode" ? 20 : 200;
    const normalized = requiredText(item, maximum);
    result[field] = field === "country" ? normalized.toUpperCase() : normalized;
  }
  return result;
}

export function decimalString(value: unknown, integerDigits: number, fractionDigits: number): string {
  if (typeof value !== "string" || !new RegExp(`^\\d{1,${integerDigits}}(?:\\.\\d{1,${fractionDigits}})?$`).test(value)) {
    throw new HttpError("invalid_request", 400);
  }
  const [integer, fraction = ""] = value.split(".");
  const normalizedInteger = BigInt(integer!).toString();
  const normalizedFraction = fraction.replace(/0+$/, "");
  return normalizedFraction ? `${normalizedInteger}.${normalizedFraction}` : normalizedInteger;
}

export function taxRate(value: unknown): string {
  const rate = decimalString(value, 3, 3);
  const [integer] = rate.split(".");
  if (BigInt(integer!) > 100n || (BigInt(integer!) === 100n && rate.includes(".") && !/^100(?:\.0+)?$/.test(rate))) {
    throw new HttpError("invalid_request", 400);
  }
  return rate;
}

export function isoDate(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError("invalid_request", 400);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new HttpError("invalid_request", 400);
  return value;
}

export interface ListQuery {
  page: number;
  pageSize: number;
  search?: string;
  order: "asc" | "desc";
  sort: string;
  isActive?: boolean;
}

export function listQuery(url: URL, allowedSorts: readonly string[], defaultSort = "name"): ListQuery {
  const allowed = new Set(["page", "pageSize", "search", "sort", "order", "isActive", "type"]);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) throw new HttpError("invalid_request", 400);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new HttpError("invalid_request", 400);
  }
  const searchValue = url.searchParams.get("search")?.trim();
  if (searchValue && searchValue.length > 100) throw new HttpError("invalid_request", 400);
  const sort = url.searchParams.get("sort") ?? defaultSort;
  if (!allowedSorts.includes(sort)) throw new HttpError("invalid_request", 400);
  const order = url.searchParams.get("order") ?? "asc";
  if (order !== "asc" && order !== "desc") throw new HttpError("invalid_request", 400);
  const activeValue = url.searchParams.get("isActive");
  if (activeValue !== null && activeValue !== "true" && activeValue !== "false") throw new HttpError("invalid_request", 400);
  return {
    page,
    pageSize,
    ...(searchValue ? { search: searchValue } : {}),
    sort,
    order,
    ...(activeValue === null ? {} : { isActive: activeValue === "true" }),
  };
}
