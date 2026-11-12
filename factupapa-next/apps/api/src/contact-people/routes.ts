import type { AuthApplication } from "../auth/service.js";
import { bearerToken, readJson, requireUuid } from "../http/request.js";
import { json, noContent } from "../http/response.js";
import type { RouteHandler } from "../http/router.js";
import { ContactPeopleService, validateContactPerson } from "./service.js";

const PATH = /^\/contacts\/([^/]+)\/people(?:\/([^/]+))?$/;

export function createContactPeopleRoutes(auth: AuthApplication, people: ContactPeopleService): RouteHandler {
  return async ({ request, response, url }) => {
    const match = url.pathname.match(PATH);
    if (!match) return false;
    const contactId = requireUuid(match[1]);
    const personId = match[2] ? requireUuid(match[2]) : null;
    const identity = await auth.authenticate(bearerToken(request));
    if (!personId) {
      if (request.method === "GET") {
        json(response, 200, await people.list(identity, contactId));
        return true;
      }
      if (request.method === "POST") {
        json(response, 201, await people.create(identity, contactId, validateContactPerson(await readJson(request))));
        return true;
      }
      return false;
    }
    if (request.method === "PATCH") {
      json(response, 200, await people.update(identity, contactId, personId, validateContactPerson(await readJson(request), true)));
      return true;
    }
    if (request.method === "DELETE") {
      await people.remove(identity, contactId, personId);
      noContent(response);
      return true;
    }
    return false;
  };
}
