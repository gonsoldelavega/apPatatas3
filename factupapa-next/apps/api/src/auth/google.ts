import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  frontendUrl: string;
}

interface OAuthState {
  nonce: string;
  verifier: string;
  expiresAt: number;
}

export interface GoogleIdentity {
  email: string;
}

function encode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function equal(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class GoogleOAuthService {
  private readonly jwks = createRemoteJWKSet(
    new URL("https://www.googleapis.com/oauth2/v3/certs"),
  );

  constructor(private readonly config: GoogleOAuthConfig) {}

  private sign(payload: string): string {
    return createHmac("sha256", this.config.clientSecret)
      .update(payload)
      .digest("base64url");
  }

  createAuthorization(): { url: string; stateCookie: string } {
    const nonce = randomBytes(24).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const state: OAuthState = {
      nonce,
      verifier,
      expiresAt: Date.now() + 10 * 60_000,
    };
    const payload = encode(JSON.stringify(state));
    const stateCookie = `${payload}.${this.sign(payload)}`;
    const challenge = createHmac("sha256", "")
      .update(verifier)
      .digest()
      .toString("base64url");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", nonce);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("prompt", "select_account");
    return { url: url.toString(), stateCookie };
  }

  private verifyState(cookie: string, nonce: string): OAuthState {
    const [payload, signature, extra] = cookie.split(".");
    if (!payload || !signature || extra || !equal(signature, this.sign(payload))) {
      throw new Error("invalid_oauth_state");
    }
    let state: OAuthState;
    try {
      state = JSON.parse(decode(payload)) as OAuthState;
    } catch {
      throw new Error("invalid_oauth_state");
    }
    if (
      typeof state.nonce !== "string" ||
      typeof state.verifier !== "string" ||
      typeof state.expiresAt !== "number" ||
      state.expiresAt < Date.now() ||
      !equal(state.nonce, nonce)
    ) {
      throw new Error("invalid_oauth_state");
    }
    return state;
  }

  async exchange(code: string, nonce: string, stateCookie: string): Promise<GoogleIdentity> {
    const state = this.verifyState(stateCookie, nonce);
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: "authorization_code",
        code_verifier: state.verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("oauth_exchange_failed");
    const tokens = (await response.json()) as { id_token?: unknown };
    if (typeof tokens.id_token !== "string") throw new Error("oauth_exchange_failed");
    const verified = await jwtVerify(tokens.id_token, this.jwks, {
      audience: this.config.clientId,
      issuer: ["https://accounts.google.com", "accounts.google.com"],
    });
    if (
      typeof verified.payload.email !== "string" ||
      verified.payload.email_verified !== true
    ) {
      throw new Error("oauth_email_not_verified");
    }
    return { email: verified.payload.email.trim().toLowerCase() };
  }

  get callbackPath(): string {
    return new URL(this.config.redirectUri).pathname;
  }

  get frontendLoginUrl(): string {
    return new URL("/login", this.config.frontendUrl).toString();
  }
}
