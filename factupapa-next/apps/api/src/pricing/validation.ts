import { assertAllowedKeys, decimalString, isoDate, listQuery, optionalBoolean } from "../domain/validation.js";
import { HttpError } from "../http/errors.js";
import type { EffectiveProductQuery, PriceInput } from "./types.js";

export function validatePrice(body: Record<string, unknown>): PriceInput {
  assertAllowedKeys(body, ["price", "validFrom", "isActive"]);
  const validFrom = isoDate(body.validFrom);
  const isActive = optionalBoolean(body.isActive);
  return {
    price: decimalString(body.price, 10, 4),
    ...(validFrom === undefined ? {} : { validFrom }),
    ...(isActive === undefined ? {} : { isActive }),
  };
}

export function validateEffectiveProducts(url: URL): EffectiveProductQuery {
  if (url.searchParams.has("type")) throw new HttpError("invalid_request", 400);
  return listQuery(url, ["name", "effectivePrice"]);
}
