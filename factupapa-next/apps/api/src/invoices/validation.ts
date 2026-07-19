import {
  assertAllowedKeys,
  decimalString,
  isoDate,
  optionalText,
  optionalBoolean,
  requiredText,
  taxRate,
} from "../domain/validation.js";
import { HttpError } from "../http/errors.js";
import type { ProductUnit } from "../products/types.js";
import type { InvoiceCreate, InvoiceLineInput, InvoicePatch } from "./types.js";

const units = new Set<ProductUnit>(["kg", "g", "unit", "box", "custom"]);
function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value))
    throw new HttpError("invalid_request", 400);
  return value;
}
function series(value: unknown): string {
  const result = requiredText(value, 20);
  if (!/^[A-Za-z0-9_-]+$/.test(result))
    throw new HttpError("invalid_request", 400);
  return result.toUpperCase();
}
function date(value: unknown): string {
  return (
    isoDate(value) ??
    (() => {
      throw new HttpError("invalid_request", 400);
    })()
  );
}

export function validateInvoiceCreate(
  body: Record<string, unknown>,
): InvoiceCreate {
  assertAllowedKeys(body, [
    "contactId",
    "series",
    "issueDate",
    "dueDate",
    "notes",
    "operationStartDate",
    "operationEndDate",
    "deliveryDates",
    "paymentTerms",
    "generalInformation",
    "applyContactDefaults",
  ]);
  const result: InvoiceCreate = {
    contactId: uuid(body.contactId),
    series: series(body.series ?? "F"),
    issueDate: date(body.issueDate),
    ...(body.dueDate === undefined || body.dueDate === null
      ? {}
      : { dueDate: date(body.dueDate) }),
    notes: optionalText(body.notes, 4000),
    ...(body.operationStartDate == null
      ? {}
      : { operationStartDate: date(body.operationStartDate) }),
    ...(body.operationEndDate == null
      ? {}
      : { operationEndDate: date(body.operationEndDate) }),
    deliveryDates: invoiceDates(body.deliveryDates),
    paymentTerms: optionalText(body.paymentTerms, 1000) ?? null,
    generalInformation: optionalText(body.generalInformation, 2000) ?? null,
    applyContactDefaults: optionalBoolean(body.applyContactDefaults) ?? true,
  };
  if (
    result.operationStartDate &&
    result.operationEndDate &&
    result.operationStartDate > result.operationEndDate
  )
    throw new HttpError("invalid_request", 400);
  return result;
}

export function validateInvoicePatch(
  body: Record<string, unknown>,
): InvoicePatch {
  assertAllowedKeys(
    body,
    [
      "contactId",
      "series",
      "issueDate",
      "dueDate",
      "notes",
      "operationStartDate",
      "operationEndDate",
      "deliveryDates",
      "paymentTerms",
      "generalInformation",
    ],
    true,
  );
  return {
    ...(body.contactId === undefined
      ? {}
      : { contactId: uuid(body.contactId) }),
    ...(body.series === undefined ? {} : { series: series(body.series) }),
    ...(body.issueDate === undefined
      ? {}
      : { issueDate: date(body.issueDate) }),
    ...(body.dueDate === undefined
      ? {}
      : { dueDate: body.dueDate === null ? null : date(body.dueDate) }),
    ...(body.notes === undefined
      ? {}
      : { notes: optionalText(body.notes, 4000) }),
    ...(body.operationStartDate === undefined
      ? {}
      : {
          operationStartDate:
            body.operationStartDate === null
              ? null
              : date(body.operationStartDate),
        }),
    ...(body.operationEndDate === undefined
      ? {}
      : {
          operationEndDate:
            body.operationEndDate === null ? null : date(body.operationEndDate),
        }),
    ...(body.deliveryDates === undefined
      ? {}
      : { deliveryDates: invoiceDates(body.deliveryDates) }),
    ...(body.paymentTerms === undefined
      ? {}
      : { paymentTerms: optionalText(body.paymentTerms, 1000) ?? null }),
    ...(body.generalInformation === undefined
      ? {}
      : {
          generalInformation:
            optionalText(body.generalInformation, 2000) ?? null,
        }),
  };
}

function invoiceDates(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100)
    throw new HttpError("invalid_request", 400);
  return [...new Set(value.map(date))].sort();
}

export function validateInvoiceLine(
  body: Record<string, unknown>,
): InvoiceLineInput {
  assertAllowedKeys(body, [
    "productId",
    "description",
    "quantity",
    "unit",
    "unitPrice",
    "taxRate",
    "position",
  ]);
  if (body.unit !== undefined && !units.has(body.unit as ProductUnit))
    throw new HttpError("invalid_request", 400);
  if (
    body.position !== undefined &&
    (!Number.isInteger(body.position) || Number(body.position) < 1)
  )
    throw new HttpError("invalid_request", 400);
  return {
    ...(body.productId === undefined
      ? {}
      : { productId: body.productId === null ? null : uuid(body.productId) }),
    ...(body.description === undefined
      ? {}
      : { description: requiredText(body.description, 500) }),
    quantity: decimalString(body.quantity, 12, 4),
    ...(body.unit === undefined ? {} : { unit: body.unit as ProductUnit }),
    ...(body.unitPrice === undefined
      ? {}
      : { unitPrice: decimalString(body.unitPrice, 12, 4) }),
    ...(body.taxRate === undefined ? {} : { taxRate: taxRate(body.taxRate) }),
    ...(body.position === undefined ? {} : { position: Number(body.position) }),
  };
}

export interface FromDeliveryNotesInput {
  deliveryNoteIds: string[];
  series: string;
  issueDate: string;
  dueDate?: string | null;
  notes?: string | null;
}
export function validateFromDeliveryNotes(
  body: Record<string, unknown>,
): FromDeliveryNotesInput {
  assertAllowedKeys(body, [
    "deliveryNoteIds",
    "series",
    "issueDate",
    "dueDate",
    "notes",
  ]);
  if (
    !Array.isArray(body.deliveryNoteIds) ||
    !body.deliveryNoteIds.length ||
    body.deliveryNoteIds.length > 100
  )
    throw new HttpError("invalid_request", 400);
  const notes = optionalText(body.notes, 4000);
  return {
    deliveryNoteIds: body.deliveryNoteIds.map(uuid),
    series: series(body.series ?? "F"),
    issueDate: date(body.issueDate),
    ...(body.dueDate === undefined || body.dueDate === null
      ? {}
      : { dueDate: date(body.dueDate) }),
    ...(notes === undefined ? {} : { notes }),
  };
}
