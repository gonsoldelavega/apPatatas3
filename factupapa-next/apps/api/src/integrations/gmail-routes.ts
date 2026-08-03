import type { AuthApplication } from "../auth/service.js";
import { bearerToken } from "../http/request.js";
import { json, noContent } from "../http/response.js";
import type { RouteHandler } from "../http/router.js";
import { HttpError } from "../http/errors.js";
import { GmailIntegrationService } from "./gmail.js";

function cookieValue(header: string | undefined, name: string): string | undefined {
  const encoded = header?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  if (!encoded) return undefined;
  try { return decodeURIComponent(encoded); } catch { return undefined; }
}

function stateCookie(value: string | undefined, secure: boolean): string {
  const attributes = [
    `factupapa_gmail_state=${value ? encodeURIComponent(value) : ""}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/api/integrations/gmail",
    `Max-Age=${value ? 600 : 0}`,
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

function redirect(response: import("node:http").ServerResponse, location: string, cookie: string): void {
  response.writeHead(302, { location, "cache-control": "no-store", "set-cookie": cookie });
  response.end();
}

function callbackPaths(path: string): Set<string> {
  return new Set([path, path.startsWith("/api/") ? path.slice(4) : path]);
}

export function createGmailRoutes(
  auth: AuthApplication,
  service: GmailIntegrationService | undefined,
  secureCookies: boolean,
): RouteHandler {
  return async ({ request, response, url }) => {
    if (request.method === "GET" && url.pathname === "/integrations/gmail") {
      const identity = await auth.authenticate(bearerToken(request));
      json(response, 200, service
        ? await service.status(identity)
        : { available: false, connected: false, email: null, connectedAt: null });
      return true;
    }
    if (request.method === "POST" && url.pathname === "/integrations/gmail/connect") {
      if (!service) throw new HttpError("not_found", 404);
      const identity = await auth.authenticate(bearerToken(request));
      const authorization = service.createAuthorization(identity);
      json(response, 200, { url: authorization.url }, {
        "set-cookie": stateCookie(authorization.stateCookie, secureCookies),
      });
      return true;
    }
    if (request.method === "DELETE" && url.pathname === "/integrations/gmail") {
      if (!service) throw new HttpError("not_found", 404);
      const identity = await auth.authenticate(bearerToken(request));
      await service.disconnect(identity);
      noContent(response);
      return true;
    }
    if (request.method === "GET" && service && callbackPaths(service.callbackPath).has(url.pathname)) {
      const target = new URL(service.frontendMoreUrl);
      try {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const cookie = cookieValue(request.headers.cookie, "factupapa_gmail_state");
        if (!code || !state || !cookie) throw new Error("invalid_oauth_callback");
        await service.exchange(code, state, cookie);
        target.searchParams.set("gmail", "success");
      } catch {
        target.searchParams.set("gmail", "error");
      }
      redirect(response, target.toString(), stateCookie(undefined, secureCookies));
      return true;
    }
    return false;
  };
}
