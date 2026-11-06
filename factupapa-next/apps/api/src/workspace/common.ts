import type { SessionIdentity } from "../auth/repository.js";
import { decimalString, isoDate } from "../domain/validation.js";
import { HttpError } from "../http/errors.js";

export type { Side } from "./ledger-math.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidValue(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new HttpError("invalid_request", 400);
  return value.toLowerCase();
}

export function optionalUuid(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return uuidValue(value);
}

export function sideValue(value: unknown): "side_a" | "side_b" {
  if (value === "side_a" || value === "side_b") return value;
  throw new HttpError("invalid_request", 400);
}

export function textValue(value: unknown, maximumLength: number): string {
  if (typeof value !== "string") throw new HttpError("invalid_request", 400);
  const text = value.trim();
  if (!text || text.length > maximumLength) throw new HttpError("invalid_request", 400);
  return text;
}

/** Texto opcional: `undefined` = no se toca, `null` o vacío = borrar. */
export function optionalTextValue(value: unknown, maximumLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string" || value.length > maximumLength) throw new HttpError("invalid_request", 400);
  const text = value.trim();
  return text ? text : null;
}

export function optionalDate(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return isoDate(value);
}

/** Decimal estrictamente positivo (acepta coma o punto, texto o número). */
export function positiveDecimal(value: unknown, integerDigits: number, fractionDigits: number): string {
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string") throw new HttpError("invalid_request", 400);
  const normalized = decimalString(text.trim().replace(",", "."), integerDigits, fractionDigits);
  if (!(Number(normalized) > 0)) throw new HttpError("invalid_request", 400);
  return normalized;
}

/** Nombre que se guarda como "foto" junto a cada registro (la tabla users no es legible entre usuarios). */
export function actorName(identity: SessionIdentity): string {
  const name = identity.displayName?.trim() || identity.email.split("@")[0] || "Usuario";
  return name.slice(0, 120);
}

export const todayIso = (): string => new Date().toISOString().slice(0, 10);

export function limitValue(url: URL, fallback: number, maximum: number): number {
  const raw = url.searchParams.get("limit");
  if (raw === null) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) throw new HttpError("invalid_request", 400);
  return Math.min(parsed, maximum);
}
