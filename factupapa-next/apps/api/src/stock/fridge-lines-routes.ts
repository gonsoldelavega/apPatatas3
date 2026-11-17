import type { AuthApplication } from "../auth/service.js";
import { bearerToken, readJson, requireUuid } from "../http/request.js";
import { json, noContent } from "../http/response.js";
import type { RouteHandler } from "../http/router.js";
import { FridgeLinesService, validateFridgeLine } from "./fridge-lines.js";

const PATH = /^\/stock\/fridge-lines(?:\/([^/]+)(\/deliver|\/made)?)?$/;

export function createFridgeLinesRoutes(auth: AuthApplication, lines: FridgeLinesService): RouteHandler {
  return async ({ request, response, url }) => {
    const match = url.pathname.match(PATH);
    if (!match) return false;
    const identity = await auth.authenticate(bearerToken(request));
    if (!match[1]) {
      if (request.method === "GET") {
        json(response, 200, await lines.list(identity));
        return true;
      }
      if (request.method === "POST") {
        json(response, 201, await lines.create(identity, validateFridgeLine(await readJson(request))));
        return true;
      }
      return false;
    }
    const id = requireUuid(match[1]);
    if (match[2] === "/deliver" && request.method === "POST") {
      json(response, 200, await lines.deliver(identity, id));
      return true;
    }
    if (match[2] === "/made" && request.method === "POST") {
      json(response, 200, await lines.markMade(identity, id));
      return true;
    }
    if (!match[2] && request.method === "DELETE") {
      await lines.remove(identity, id);
      noContent(response);
      return true;
    }
    return false;
  };
}
