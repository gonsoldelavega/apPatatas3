import type { AuthApplication } from "../auth/service.js";
import { assertAllowedKeys } from "../domain/validation.js";
import { HttpError } from "../http/errors.js";
import { bearerToken, readJson, requireUuid } from "../http/request.js";
import { json, noContent } from "../http/response.js";
import type { RouteHandler } from "../http/router.js";
import { ImportService } from "./service.js";
import { importStrategy, validateImportRequest } from "./validation.js";

function pagination(url: URL): { page: number; pageSize: number } {
  if ([...url.searchParams.keys()].some((key) => key !== "page" && key !== "pageSize")) throw new HttpError("invalid_request", 400);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new HttpError("invalid_request", 400);
  }
  return { page, pageSize };
}

export function createImportRoutes(auth: AuthApplication, imports: ImportService): RouteHandler {
  return async ({ request, response, url }) => {
    if (url.pathname === "/imports/validate" && request.method === "POST") {
      const identity = await auth.authenticate(bearerToken(request));
      const maximumEnvelopeBytes = imports.limits.maximumBytes * 2 + 65_536;
      json(response, 201, await imports.validate(identity, validateImportRequest(await readJson(request, maximumEnvelopeBytes))));
      return true;
    }
    if (url.pathname === "/imports" && request.method === "GET") {
      const identity = await auth.authenticate(bearerToken(request));
      const query = pagination(url);
      json(response, 200, await imports.list(identity, query.page, query.pageSize));
      return true;
    }
    if (url.pathname === "/imports/detect-columns") return false;
    const match = url.pathname.match(/^\/imports\/([^/]+)(?:\/(confirm|cancel))?$/);
    if (!match) return false;
    const id = requireUuid(match[1]);
    const identity = await auth.authenticate(bearerToken(request));
    if (!match[2] && request.method === "GET") {
      json(response, 200, await imports.get(identity, id));
      return true;
    }
    if (match[2] === "confirm" && request.method === "POST") {
      const body = await readJson(request);
      assertAllowedKeys(body, ["strategy"]);
      json(response, 200, await imports.confirm(identity, id, importStrategy(body.strategy)));
      return true;
    }
    if (match[2] === "cancel" && request.method === "POST") {
      const body = await readJson(request);
      assertAllowedKeys(body, []);
      await imports.cancel(identity, id);
      noContent(response);
      return true;
    }
    return false;
  };
}
