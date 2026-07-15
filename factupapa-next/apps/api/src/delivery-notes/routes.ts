import type { AuthApplication } from "../auth/service.js";
import { bearerToken, readJson, requireUuid } from "../http/request.js";
import { json, noContent } from "../http/response.js";
import type { RouteHandler } from "../http/router.js";
import { DeliveryNoteService } from "./service.js";
import {
  validateDeliveryCreate,
  validateDeliveryLine,
  validateDeliveryPatch,
} from "./validation.js";
export function createDeliveryNoteRoutes(
  auth: AuthApplication,
  service: DeliveryNoteService,
): RouteHandler {
  return async ({ request, response, url }) => {
    if (url.pathname === "/delivery-notes") {
      const identity = await auth.authenticate(bearerToken(request));
      if (request.method === "GET") {
        json(response, 200, await service.list(identity, url));
        return true;
      }
      if (request.method === "POST") {
        json(
          response,
          201,
          await service.create(
            identity,
            validateDeliveryCreate(await readJson(request)),
          ),
        );
        return true;
      }
    }
    const action = url.pathname.match(
      /^\/delivery-notes\/([^/]+)\/(issue|cancel)$/,
    );
    if (action && request.method === "POST") {
      const identity = await auth.authenticate(bearerToken(request));
      json(
        response,
        200,
        await service[action[2] as "issue" | "cancel"](
          identity,
          requireUuid(action[1]),
        ),
      );
      return true;
    }
    const line = url.pathname.match(
      /^\/delivery-notes\/([^/]+)\/lines(?:\/([^/]+))?$/,
    );
    if (line) {
      const identity = await auth.authenticate(bearerToken(request));
      const id = requireUuid(line[1]);
      if (request.method === "POST" && !line[2]) {
        json(
          response,
          201,
          await service.addLine(
            identity,
            id,
            validateDeliveryLine(await readJson(request)),
          ),
        );
        return true;
      }
      if (request.method === "PATCH" && line[2]) {
        json(
          response,
          200,
          await service.updateLine(
            identity,
            id,
            requireUuid(line[2]),
            validateDeliveryLine(await readJson(request)),
          ),
        );
        return true;
      }
      if (request.method === "DELETE" && line[2]) {
        await service.deleteLine(identity, id, requireUuid(line[2]));
        noContent(response);
        return true;
      }
    }
    const match = url.pathname.match(/^\/delivery-notes\/([^/]+)$/);
    if (!match) return false;
    const identity = await auth.authenticate(bearerToken(request));
    const id = requireUuid(match[1]);
    if (request.method === "GET") {
      json(response, 200, await service.get(identity, id));
      return true;
    }
    if (request.method === "PATCH") {
      json(
        response,
        200,
        await service.update(
          identity,
          id,
          validateDeliveryPatch(await readJson(request)),
        ),
      );
      return true;
    }
    return false;
  };
}
