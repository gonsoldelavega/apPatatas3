import type { AuthApplication } from "../auth/service.js";
import { assertAllowedKeys } from "../domain/validation.js";
import { HttpError } from "../http/errors.js";
import { bearerToken, readJson, requireUuid } from "../http/request.js";
import { json, noContent } from "../http/response.js";
import type { RouteHandler } from "../http/router.js";
import { detectColumns } from "./mapping.js";
import { ImportMappingService } from "./mappings.js";
import type { ImportEntityType, ImportSourceFormat } from "./types.js";
import { validateImportRequest } from "./validation.js";

function entity(value: unknown): ImportEntityType {
  if (value !== "contacts" && value !== "products" && value !== "contact_product_prices") throw new HttpError("invalid_request", 400);
  return value;
}
function format(value: unknown): ImportSourceFormat {
  if (value !== "csv" && value !== "json") throw new HttpError("invalid_request", 400);
  return value;
}
function createInput(body: Record<string, unknown>) {
  assertAllowedKeys(body, ["name", "entityType", "sourceFormat", "mapping"]);
  if (typeof body.name !== "string" || !body.mapping || typeof body.mapping !== "object" || Array.isArray(body.mapping)) throw new HttpError("invalid_request", 400);
  return { name: body.name, entityType: entity(body.entityType), sourceFormat: format(body.sourceFormat), mapping: body.mapping as Record<string, string> };
}

export function createImportMappingRoutes(auth: AuthApplication, mappings: ImportMappingService): RouteHandler {
  return async ({ request, response, url }) => {
    if (url.pathname === "/imports/detect-columns" && request.method === "POST") {
      const identity = await auth.authenticate(bearerToken(request));
      void identity;
      json(response, 200, detectColumns(validateImportRequest(await readJson(request, 1_500_000))));
      return true;
    }
    if (url.pathname === "/import-mappings" && request.method === "GET") {
      const identity = await auth.authenticate(bearerToken(request));
      const value = url.searchParams.get("entityType");
      if ([...url.searchParams.keys()].some((key) => key !== "entityType")) throw new HttpError("invalid_request", 400);
      json(response, 200, await mappings.list(identity, value ? entity(value) : undefined));
      return true;
    }
    if (url.pathname === "/import-mappings" && request.method === "POST") {
      const identity = await auth.authenticate(bearerToken(request));
      json(response, 201, await mappings.create(identity, createInput(await readJson(request))));
      return true;
    }
    const match = url.pathname.match(/^\/import-mappings\/([^/]+)$/);
    if (!match) return false;
    const id = requireUuid(match[1]);
    const identity = await auth.authenticate(bearerToken(request));
    if (request.method === "GET") { json(response, 200, await mappings.get(identity, id)); return true; }
    if (request.method === "PATCH") {
      const body = await readJson(request);
      assertAllowedKeys(body, ["name", "mapping"]);
      if (body.name !== undefined && typeof body.name !== "string") throw new HttpError("invalid_request", 400);
      if (body.mapping !== undefined && (!body.mapping || typeof body.mapping !== "object" || Array.isArray(body.mapping))) throw new HttpError("invalid_request", 400);
      json(response, 200, await mappings.update(identity, id, { ...(body.name === undefined ? {} : { name: body.name }), ...(body.mapping === undefined ? {} : { mapping: body.mapping as Record<string,string> }) }));
      return true;
    }
    if (request.method === "DELETE") { await mappings.remove(identity, id); noContent(response); return true; }
    return false;
  };
}
