import { HttpError } from "../http/errors.js";
type Json = Record<string, unknown>;
const allowed = (i: Json, k: string[]) => {
  if (Object.keys(i).some((x) => !k.includes(x)))
    throw new HttpError("invalid_request", 400);
};
const text = (v: unknown, m: number, r = false): string | null => {
  if (v == null || v === "") {
    if (r) throw new HttpError("invalid_request", 400);
    return null;
  }
  if (typeof v !== "string" || v.trim().length > m || (r && !v.trim()))
    throw new HttpError("invalid_request", 400);
  return v.trim();
};
const uuid = (v: unknown, r = false) => {
  const p = text(v, 36, r);
  if (
    p &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      p,
    )
  )
    throw new HttpError("invalid_request", 400);
  return p;
};
const date = (v: unknown, r = false) => {
  const p = text(v, 10, r);
  if (p) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p))
      throw new HttpError("invalid_request", 400);
    const d = new Date(`${p}T00:00:00Z`);
    if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== p)
      throw new HttpError("invalid_request", 400);
  }
  return p;
};
const decimal = (v: unknown, pos = false) => {
  if (typeof v !== "string" && typeof v !== "number")
    throw new HttpError("invalid_request", 400);
  const p = String(v).replace(",", ".");
  if (!/^\d{1,12}(?:\.\d{1,4})?$/.test(p) || (pos && Number(p) <= 0))
    throw new HttpError("invalid_request", 400);
  return p;
};
const categories = new Set([
    "mercancia",
    "autonomo",
    "gestoria",
    "transporte",
    "suministros",
    "alquiler",
    "impuestos",
    "otros",
  ]),
  units = new Set(["kg", "g", "unit", "box", "custom"]);
export interface PurchaseInput {
  supplierId: string;
  documentId: string | null;
  supplierInvoiceNumber: string | null;
  issueDate: string;
  dueDate: string | null;
  category: string;
  notes: string | null;
  lines: Array<{
    productId: string | null;
    description: string;
    quantity: string;
    unit: string;
    unitCost: string;
    taxRate: string;
  }>;
}
export function validatePurchase(i: Json): PurchaseInput {
  allowed(i, [
    "supplierId",
    "documentId",
    "supplierInvoiceNumber",
    "issueDate",
    "dueDate",
    "category",
    "notes",
    "lines",
  ]);
  if (!Array.isArray(i.lines) || i.lines.length > 200)
    throw new HttpError("invalid_request", 400);
  const category = text(i.category, 30) ?? "mercancia";
  if (!categories.has(category)) throw new HttpError("invalid_request", 400);
  return {
    supplierId: uuid(i.supplierId, true)!,
    documentId: uuid(i.documentId),
    supplierInvoiceNumber: text(i.supplierInvoiceNumber, 100),
    issueDate: date(i.issueDate, true)!,
    dueDate: date(i.dueDate),
    category,
    notes: text(i.notes, 4000),
    lines: i.lines.map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new HttpError("invalid_request", 400);
      const l = raw as Json;
      allowed(l, [
        "productId",
        "description",
        "quantity",
        "unit",
        "unitCost",
        "taxRate",
      ]);
      const unit = text(l.unit, 10, true)!;
      if (!units.has(unit)) throw new HttpError("invalid_request", 400);
      const rate = decimal(l.taxRate);
      if (Number(rate) > 100) throw new HttpError("invalid_request", 400);
      return {
        productId: uuid(l.productId),
        description: text(l.description, 500, true)!,
        quantity: decimal(l.quantity, true),
        unit,
        unitCost: decimal(l.unitCost),
        taxRate: rate,
      };
    }),
  };
}
export interface RecurringExpenseInput {
  supplierId: string | null;
  name: string;
  category: string;
  amount: string;
  taxRate: string;
  chargeDay: number;
  startsOn: string;
  endsOn: string | null;
  notes: string | null;
}
export function validateRecurringExpense(i: Json): RecurringExpenseInput {
  allowed(i, [
    "supplierId",
    "name",
    "category",
    "amount",
    "taxRate",
    "chargeDay",
    "startsOn",
    "endsOn",
    "notes",
  ]);
  const category = text(i.category, 30, true)!;
  if (!categories.has(category) || category === "mercancia")
    throw new HttpError("invalid_request", 400);
  const chargeDay = Number(i.chargeDay ?? 1);
  if (!Number.isInteger(chargeDay) || chargeDay < 1 || chargeDay > 28)
    throw new HttpError("invalid_request", 400);
  const taxRate = decimal(i.taxRate ?? "0");
  if (Number(taxRate) > 100) throw new HttpError("invalid_request", 400);
  const startsOn = date(i.startsOn, true)!,
    endsOn = date(i.endsOn);
  if (endsOn && endsOn < startsOn) throw new HttpError("invalid_request", 400);
  return {
    supplierId: uuid(i.supplierId),
    name: text(i.name, 200, true)!,
    category,
    amount: decimal(i.amount),
    taxRate,
    chargeDay,
    startsOn,
    endsOn,
    notes: text(i.notes, 2000),
  };
}
export function validateStockAdjustment(i: Json) {
  allowed(i, ["productId", "occurredOn", "quantityDelta", "reason", "note"]);
  const reason = text(i.reason, 20, true)!;
  if (!new Set(["initial", "loss", "correction", "other"]).has(reason))
    throw new HttpError("invalid_request", 400);
  const quantityDelta =
    typeof i.quantityDelta === "string" || typeof i.quantityDelta === "number"
      ? String(i.quantityDelta).replace(",", ".")
      : "";
  if (
    !/^-?\d{1,12}(?:\.\d{1,4})?$/.test(quantityDelta) ||
    Number(quantityDelta) === 0
  )
    throw new HttpError("invalid_request", 400);
  return {
    productId: uuid(i.productId, true)!,
    occurredOn: date(i.occurredOn, true)!,
    quantityDelta,
    reason,
    note: text(i.note, 1000),
  };
}
export function financeRange(url: URL) {
  const now = new Date(),
    month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
    from = url.searchParams.get("from") ?? `${month}-01`,
    to =
      url.searchParams.get("to") ??
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
        .toISOString()
        .slice(0, 10);
  if (date(from, true) !== from || date(to, true) !== to || from > to)
    throw new HttpError("invalid_request", 400);
  return { from, to };
}
