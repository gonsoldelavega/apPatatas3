import type { AuthApplication } from "./service.js";
import { bearerToken, readJson, requireString } from "../http/request.js";
import { json, noContent } from "../http/response.js";
import type { RouteHandler } from "../http/router.js";

export function createAuthRoutes(auth: AuthApplication): RouteHandler {
  return async ({ request, response, url }) => {
    if (request.method === "POST" && url.pathname === "/auth/login") {
      const body = await readJson(request);
      const tokens = await auth.login(
        requireString(body, "email", 320),
        requireString(body, "password", 128),
        request.socket.remoteAddress ?? "unknown",
      );
      json(response, 200, tokens);
      return true;
    }
    if (request.method === "POST" && url.pathname === "/auth/refresh") {
      const body = await readJson(request);
      json(response, 200, await auth.refresh(requireString(body, "refreshToken", 256)));
      return true;
    }
    if (request.method === "POST" && url.pathname === "/auth/logout") {
      const body = await readJson(request);
      await auth.logout(bearerToken(request), requireString(body, "refreshToken", 256));
      noContent(response);
      return true;
    }
    if (request.method === "GET" && url.pathname === "/me") {
      json(response, 200, await auth.me(bearerToken(request)));
      return true;
    }
    return false;
  };
}
