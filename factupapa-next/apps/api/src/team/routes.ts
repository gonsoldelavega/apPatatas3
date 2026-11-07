import type { AuthApplication } from "../auth/service.js";
import { HttpError } from "../http/errors.js";
import { json, noContent } from "../http/response.js";
import { bearerToken, readJson, requireString, requireUuid } from "../http/request.js";
import type { RouteHandler } from "../http/router.js";
import type { TeamService } from "./service.js";

export function createTeamRoutes(auth: AuthApplication, team: TeamService): RouteHandler {
  return async ({ request, response, url }) => {
    if (url.pathname === "/team/welcome" && request.method === "GET") {
      const identity = await auth.authenticate(bearerToken(request));
      json(response, 200, { message: await team.myWelcome(identity) });
      return true;
    }
    if (url.pathname === "/team/members") {
      if (request.method === "GET") {
        const identity = await auth.authenticate(bearerToken(request));
        json(response, 200, await team.list(identity));
        return true;
      }
      if (request.method === "POST") {
        const identity = await auth.authenticate(bearerToken(request));
        const body = await readJson(request);
        const email = requireString(body, "email", 320).trim().toLowerCase();
        const welcome = typeof body.welcomeMessage === "string" ? body.welcomeMessage : null;
        json(response, 201, await team.add(identity, email, welcome));
        return true;
      }
      return false;
    }
    const match = url.pathname.match(/^\/team\/members\/([^/]+)$/);
    if (match && request.method === "PATCH") {
      const identity = await auth.authenticate(bearerToken(request));
      const body = await readJson(request);
      const message = typeof body.welcomeMessage === "string" ? body.welcomeMessage : null;
      await team.setWelcome(identity, requireUuid(match[1]), message);
      noContent(response);
      return true;
    }
    if (match && request.method === "DELETE") {
      const identity = await auth.authenticate(bearerToken(request));
      await team.remove(identity, requireUuid(match[1]));
      noContent(response);
      return true;
    }
    if (url.pathname.startsWith("/team/")) throw new HttpError("not_found", 404);
    return false;
  };
}
