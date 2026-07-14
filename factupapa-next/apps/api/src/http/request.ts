import type { IncomingMessage } from "node:http";
import { AuthError } from "../auth/service.js";
import { HttpError } from "./errors.js";

export async function readJson(request: IncomingMessage, maximumBytes = 16_384): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumBytes) throw new HttpError("payload_too_large", 413);
    chunks.push(buffer);
  }
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    const parsed: unknown = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new HttpError("invalid_request", 400);
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError("invalid_request", 400);
  }
}

export function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ") || authorization.length <= 7) {
    throw new AuthError("unauthorized", 401);
  }
  return authorization.slice(7);
}

export function requireString(body: Record<string, unknown>, field: string, maximumLength: number): string {
  const value = body[field];
  if (typeof value !== "string" || value.length < 1 || value.length > maximumLength) {
    throw new HttpError("invalid_request", 400);
  }
  return value;
}

export function requireUuid(value: string | undefined): string {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError("not_found", 404);
  }
  return value.toLowerCase();
}
