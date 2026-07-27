import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { GoogleOAuthService } from "../src/auth/google.js";

test("Google OAuth usa estado firmado, PKCE S256 y retorno exacto", () => {
  const service = new GoogleOAuthService({
    clientId: "client.apps.googleusercontent.com",
    clientSecret: "private-test-secret",
    redirectUri: "https://app.example.test/api/auth/google/callback",
    frontendUrl: "https://app.example.test",
  });
  const authorization = service.createAuthorization();
  const url = new URL(authorization.url);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("client_id"), "client.apps.googleusercontent.com");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://app.example.test/api/auth/google/callback",
  );
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.match(url.searchParams.get("code_challenge") ?? "", /^[A-Za-z0-9_-]{43}$/);
  assert.match(url.searchParams.get("state") ?? "", /^[A-Za-z0-9_-]{32}$/);
  assert.doesNotMatch(authorization.stateCookie, /private-test-secret/);
  assert.equal(service.callbackPath, "/api/auth/google/callback");
  assert.equal(service.frontendLoginUrl, "https://app.example.test/login");
});

test("el reto PKCE es SHA-256 base64url del verificador firmado", () => {
  const service = new GoogleOAuthService({
    clientId: "client",
    clientSecret: "secret",
    redirectUri: "http://127.0.0.1:4100/auth/google/callback",
    frontendUrl: "http://127.0.0.1:4173",
  });
  const authorization = service.createAuthorization();
  const payload = authorization.stateCookie.split(".")[0];
  assert.ok(payload);
  const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    verifier: string;
  };
  const expected = createHash("sha256").update(state.verifier).digest("base64url");
  assert.equal(new URL(authorization.url).searchParams.get("code_challenge"), expected);
});
