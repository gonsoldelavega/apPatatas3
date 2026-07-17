import type { AuthApplication } from "../auth/service.js";
import { bearerToken, readJson, requireUuid } from "../http/request.js";
import { json, noContent } from "../http/response.js";
import type { RouteHandler } from "../http/router.js";
import { ContactService } from "./service.js";
import {
  validateContactCreate,
  validateContactList,
  validateContactPatch,
} from "./validation.js";

export function createContactRoutes(
  auth: AuthApplication,
  contacts: ContactService,
): RouteHandler {
  return async ({ request, response, url }) => {
    if (url.pathname === "/contacts" && request.method === "POST") {
      const identity = await auth.authenticate(bearerToken(request));
      json(
        response,
        201,
        await contacts.create(
          identity,
          validateContactCreate(await readJson(request)),
        ),
      );
      return true;
    }
    if (url.pathname === "/contacts" && request.method === "GET") {
      const identity = await auth.authenticate(bearerToken(request));
      json(
        response,
        200,
        await contacts.list(identity, validateContactList(url)),
      );
      return true;
    }
    const match = url.pathname.match(/^\/contacts\/([^/]+)$/);
    if (!match) return false;
    const id = requireUuid(match[1]);
    const identity = await auth.authenticate(bearerToken(request));
    if (request.method === "GET") {
      json(response, 200, await contacts.get(identity, id));
      return true;
    }
    if (request.method === "PATCH") {
      json(
        response,
        200,
        await contacts.update(
          identity,
          id,
          validateContactPatch(await readJson(request)),
        ),
      );
      return true;
    }
    if (request.method === "DELETE") {
      await contacts.deactivate(identity, id);
      noContent(response);
      return true;
    }
    return false;
  };
}
