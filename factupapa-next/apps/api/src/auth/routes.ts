import { AuthError, type AuthApplication, type AuthTokens } from "./service.js";
import type { GoogleOAuthApplication } from "./google.js";
import { bearerToken, readJson, requireString } from "../http/request.js";
import { json, noContent } from "../http/response.js";
import type { RouteHandler } from "../http/router.js";

interface AuthCookieOptions {
  name: string;
  secure: boolean;
  maxAgeSeconds: number;
  path?: string;
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

function cookieHeader(
  name: string,
  value: string | undefined,
  options: { secure: boolean; path: string; maxAgeSeconds: number; sameSite: "Strict" | "Lax" },
): string {
  const attributes = [
    `${name}=${value ? encodeURIComponent(value) : ""}`,
    "HttpOnly",
    `SameSite=${options.sameSite}`,
    `Path=${options.path}`,
    `Max-Age=${value ? options.maxAgeSeconds : 0}`,
  ];
  if (options.secure) attributes.push("Secure");
  return attributes.join("; ");
}

function refreshCookie(options: AuthCookieOptions, token?: string): string {
  return cookieHeader(options.name, token, {
    secure: options.secure,
    path: options.path ?? "/auth",
    maxAgeSeconds: options.maxAgeSeconds,
    sameSite: "Strict",
  });
}

function publicTokens(tokens: AuthTokens) {
  return {
    accessToken: tokens.accessToken,
    tokenType: tokens.tokenType,
    expiresIn: tokens.expiresIn,
  };
}

function redirect(response: import("node:http").ServerResponse, location: string, cookies: string[] = []): void {
  response.writeHead(302, {
    location,
    "cache-control": "no-store",
    ...(cookies.length > 0 ? { "set-cookie": cookies } : {}),
  });
  response.end();
}

function externalAuthPath(callbackPath: string): string {
  return callbackPath.slice(0, callbackPath.lastIndexOf("/google/callback")) || "/auth";
}

function internalCallbackPaths(callbackPath: string): Set<string> {
  return new Set([
    callbackPath,
    callbackPath.startsWith("/api/") ? callbackPath.slice(4) : callbackPath,
  ]);
}

export function createAuthRoutes(
  auth: AuthApplication,
  cookie: AuthCookieOptions,
  google?: GoogleOAuthApplication,
): RouteHandler {
  return async ({ request, response, url }) => {
    if (request.method === "GET" && url.pathname === "/auth/google") {
      if (!google || !auth.googleLogin) {
        json(response, 404, { error: "not_found" });
        return true;
      }
      const authorization = google.createAuthorization();
      const statePath = `${externalAuthPath(google.callbackPath)}/google`;
      redirect(response, authorization.url, [
        cookieHeader("factupapa_google_state", authorization.stateCookie, {
          secure: cookie.secure,
          path: statePath,
          maxAgeSeconds: 600,
          sameSite: "Lax",
        }),
      ]);
      return true;
    }

    if (
      request.method === "GET" &&
      google &&
      internalCallbackPaths(google.callbackPath).has(url.pathname)
    ) {
      const loginUrl = new URL(google.frontendLoginUrl);
      const statePath = `${externalAuthPath(google.callbackPath)}/google`;
      const clearState = cookieHeader("factupapa_google_state", undefined, {
        secure: cookie.secure,
        path: statePath,
        maxAgeSeconds: 600,
        sameSite: "Lax",
      });
      try {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const stateCookie = cookieValue(
          request.headers.cookie,
          "factupapa_google_state",
        );
        if (!code || !state || !stateCookie || !auth.googleLogin) {
          throw new Error("invalid_oauth_callback");
        }
        const identity = await google.exchange(code, state, stateCookie);
        const tokens = await auth.googleLogin(identity.email, identity.displayName);
        loginUrl.searchParams.set("google", "success");
        redirect(response, loginUrl.toString(), [
          clearState,
          refreshCookie(cookie, tokens.refreshToken),
        ]);
      } catch (error) {
        const reason =
          error instanceof Error &&
          ["invalid_oauth_callback", "invalid_oauth_state"].includes(error.message)
            ? "state"
            : error instanceof Error && error.message === "oauth_exchange_failed"
              ? "exchange"
              : error instanceof Error && error.message === "oauth_email_not_verified"
                ? "identity"
                : "registration";
        loginUrl.searchParams.set("google", reason);
        redirect(response, loginUrl.toString(), [clearState]);
      }
      return true;
    }

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
      const clearCookie = refreshCookie(cookie);
      response.setHeader("set-cookie", clearCookie);
      if (token) {
        try {
          await auth.logout(token);
        } catch (error) {
          if (!(error instanceof AuthError) || error.status !== 401) throw error;
        }
      }
      noContent(response, { "set-cookie": clearCookie });
      return true;
    }
    if (request.method === "GET" && url.pathname === "/me") {
      json(response, 200, await auth.me(bearerToken(request)));
      return true;
    }
    if (request.method === "GET" && url.pathname === "/auth/sessions") {
      json(response, 200, {
        items: await auth.activeSessions(bearerToken(request)),
      });
      return true;
    }
    if (
      request.method === "POST" &&
      url.pathname === "/auth/sessions/revoke-others"
    ) {
      json(response, 200, {
        revoked: await auth.revokeOtherSessions(bearerToken(request)),
      });
      return true;
    }
    if (
      request.method === "POST" &&
      url.pathname === "/auth/change-password"
    ) {
      const body = await readJson(request);
      await auth.changePassword(
        bearerToken(request),
        requireString(body, "currentPassword", 128),
        requireString(body, "newPassword", 128),
      );
      noContent(response);
      return true;
    }
    return false;
  };
}
