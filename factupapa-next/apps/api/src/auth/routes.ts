import { AuthError, type AuthApplication } from "./service.js";
import { bearerToken, readJson, requireString } from "../http/request.js";
import { json, noContent } from "../http/response.js";
import type { RouteHandler } from "../http/router.js";

interface AuthCookieOptions {
  name: string;
  secure: boolean;
  maxAgeSeconds: number;
}

function cookieValue(
  header: string | undefined,
  name: string,
): string | undefined {
  const encoded = header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!encoded) return undefined;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
}

function refreshCookie(options: AuthCookieOptions, token?: string): string {
  const attributes = [
    `${options.name}=${token ? encodeURIComponent(token) : ""}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/auth",
    `Max-Age=${token ? options.maxAgeSeconds : 0}`,
  ];
  if (options.secure) attributes.push("Secure");
  return attributes.join("; ");
}

function publicTokens(tokens: Awaited<ReturnType<AuthApplication["login"]>>) {
  return {
    accessToken: tokens.accessToken,
    tokenType: tokens.tokenType,
    expiresIn: tokens.expiresIn,
  };
}

export function createAuthRoutes(
  auth: AuthApplication,
  cookie: AuthCookieOptions,
): RouteHandler {
  return async ({ request, response, url }) => {
    if (request.method === "POST" && url.pathname === "/auth/login") {
      const body = await readJson(request);
      const tokens = await auth.login(
        requireString(body, "email", 320),
        requireString(body, "password", 128),
        request.socket.remoteAddress ?? "unknown",
      );
      json(response, 200, publicTokens(tokens), {
        "set-cookie": refreshCookie(cookie, tokens.refreshToken),
      });
      return true;
    }
    if (request.method === "POST" && url.pathname === "/auth/refresh") {
      const token = cookieValue(request.headers.cookie, cookie.name);
      if (!token) throw new AuthError("invalid_refresh_token", 401);
      const tokens = await auth.refresh(token);
      json(response, 200, publicTokens(tokens), {
        "set-cookie": refreshCookie(cookie, tokens.refreshToken),
      });
      return true;
    }
    if (request.method === "POST" && url.pathname === "/auth/logout") {
      const token = cookieValue(request.headers.cookie, cookie.name);
      if (token) await auth.logout(token).catch(() => undefined);
      noContent(response, { "set-cookie": refreshCookie(cookie) });
      return true;
    }
    if (request.method === "GET" && url.pathname === "/me") {
      json(response, 200, await auth.me(bearerToken(request)));
      return true;
    }
    return false;
  };
}
