import {
  assertAllowedKeys,
  decimalString,
  isoDate,
  optionalText,
  requiredText,
  taxRate,
} from "../domain/validation.js";
import { HttpError } from "../http/errors.js";
import type { ProductUnit } from "../products/types.js";
import type {
  DeliveryCreate,
  DeliveryLineInput,
  DeliveryPatch,
} from "./types.js";
const units = new Set<ProductUnit>(["kg", "g", "unit", "box", "custom"]);
const uuid = (value: unknown): string => {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value))
    throw new HttpError("invalid_request", 400);
  return value;
};
const series = (value: unknown) => {
  const result = requiredText(value, 20);
  if (!/^[A-Za-z0-9_-]+$/.test(result))
    throw new HttpError("invalid_request", 400);
  return result.toUpperCase();
};
export function validateDeliveryCreate(
  body: Record<string, unknown>,
): DeliveryCreate {
  assertAllowedKeys(body, ["contactId", "series", "issueDate", "notes"]);
  return {
    contactId: uuid(body.contactId),
    series: series(body.series ?? "A"),
    issueDate:
      isoDate(body.issueDate) ??
      (() => {
        throw new HttpError("invalid_request", 400);
      })(),
    notes: optionalText(body.notes, 4000),
  };
}
export function validateDeliveryPatch(
  body: Record<string, unknown>,
): DeliveryPatch {
  assertAllowedKeys(body, ["contactId", "series", "issueDate", "notes"], true);
  return {
    ...(body.contactId === undefined
      ? {}
      : { contactId: uuid(body.contactId) }),
    ...(body.series === undefined ? {} : { series: series(body.series) }),
    ...(body.issueDate === undefined
      ? {}
      : { issueDate: isoDate(body.issueDate)! }),
    ...(body.notes === undefined
      ? {}
      : { notes: optionalText(body.notes, 4000) }),
  };
}
export function validateDeliveryLine(
  body: Record<string, unknown>,
): DeliveryLineInput {
  assertAllowedKeys(body, [
    "productId",
    "description",
    "quantity",
    "unit",
    "unitPrice",
    "taxRate",
    "position",
  ]);
  const unit = body.unit;
  if (unit !== undefined && !units.has(unit as ProductUnit))
    throw new HttpError("invalid_request", 400);
  const position = body.position;
  if (
    position !== undefined &&
    (!Number.isInteger(position) || Number(position) < 1)
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
    ...(unit === undefined ? {} : { unit: unit as ProductUnit }),
    ...(body.unitPrice === undefined
      ? {}
      : { unitPrice: decimalString(body.unitPrice, 12, 4) }),
    ...(body.taxRate === undefined ? {} : { taxRate: taxRate(body.taxRate) }),
    ...(position === undefined ? {} : { position: Number(position) }),
  };
}
