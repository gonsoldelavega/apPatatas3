import {
  createCipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Pool } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { withTenantTransaction, type TenantContext } from "../database/client.js";

interface GmailOAuthState {
  nonce: string;
  verifier: string;
  userId: string;
  companyId: string;
  expiresAt: number;
}

export interface GmailConnection {
  available: boolean;
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
}

interface GmailConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  frontendUrl: string;
  encryptionSecret: string;
}

function equal(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class GmailIntegrationService {
  private readonly jwks = createRemoteJWKSet(
    new URL("https://www.googleapis.com/oauth2/v3/certs"),
  );
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly pool: Pool,
    private readonly config: GmailConfig,
  ) {
    this.encryptionKey = createHash("sha256")
      .update(`${config.encryptionSecret}|gmail-refresh-token`)
      .digest();
  }

  private sign(payload: string): string {
    return createHmac("sha256", this.config.encryptionSecret)
      .update(payload)
      .digest("base64url");
  }

  createAuthorization(identity: SessionIdentity): { url: string; stateCookie: string } {
    const verifier = randomBytes(48).toString("base64url");
    const state: GmailOAuthState = {
      nonce: randomBytes(24).toString("base64url"),
      verifier,
      userId: identity.userId,
      companyId: identity.companyId,
      expiresAt: Date.now() + 10 * 60_000,
    };
    const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set(
      "scope",
      "openid email https://www.googleapis.com/auth/gmail.send",
    );
    url.searchParams.set("state", state.nonce);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent select_account");
    return { url: url.toString(), stateCookie: `${payload}.${this.sign(payload)}` };
  }

  private verifyState(cookie: string, nonce: string): GmailOAuthState {
    const [payload, signature, extra] = cookie.split(".");
    if (!payload || !signature || extra || !equal(signature, this.sign(payload)))
      throw new Error("invalid_oauth_state");
    let state: GmailOAuthState;
    try {
      state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as GmailOAuthState;
    } catch {
      throw new Error("invalid_oauth_state");
    }
    if (
      typeof state.nonce !== "string" ||
      typeof state.verifier !== "string" ||
      typeof state.userId !== "string" ||
      typeof state.companyId !== "string" ||
      typeof state.expiresAt !== "number" ||
      state.expiresAt < Date.now() ||
      !equal(state.nonce, nonce)
    ) throw new Error("invalid_oauth_state");
    return state;
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted]
      .map((part) => part.toString("base64url"))
      .join(".");
  }

  async exchange(code: string, nonce: string, stateCookie: string): Promise<string> {
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
    const tokens = (await response.json()) as {
      id_token?: unknown;
      refresh_token?: unknown;
      scope?: unknown;
    };
    if (typeof tokens.id_token !== "string" || typeof tokens.refresh_token !== "string")
      throw new Error("oauth_exchange_failed");
    const refreshToken = tokens.refresh_token;
    const verified = await jwtVerify(tokens.id_token, this.jwks, {
      audience: this.config.clientId,
      issuer: ["https://accounts.google.com", "accounts.google.com"],
    });
    if (typeof verified.payload.email !== "string" || verified.payload.email_verified !== true)
      throw new Error("oauth_email_not_verified");
    const email = verified.payload.email.trim().toLowerCase();
    const context: TenantContext = { companyId: state.companyId, userId: state.userId };
    await withTenantTransaction(this.pool, context, async (client) => {
      await client.query(
        `insert into gmail_integrations(company_id,connected_by_user_id,google_email,encrypted_refresh_token,scopes)
         values($1,$2,$3,$4,$5)
         on conflict(company_id) do update set connected_by_user_id=excluded.connected_by_user_id,
           google_email=excluded.google_email,encrypted_refresh_token=excluded.encrypted_refresh_token,
           scopes=excluded.scopes,connected_at=now(),updated_at=now()`,
        [state.companyId, state.userId, email, this.encrypt(refreshToken),
          typeof tokens.scope === "string" ? tokens.scope.split(" ").filter(Boolean) : []],
      );
    });
    return email;
  }

  async status(identity: SessionIdentity): Promise<GmailConnection> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const result = await client.query<{ googleEmail: string; connectedAt: string }>(
        `select google_email "googleEmail",connected_at::text "connectedAt"
         from gmail_integrations where company_id=$1`,
        [identity.companyId],
      );
      const row = result.rows[0];
      return row
        ? { available: true, connected: true, email: row.googleEmail, connectedAt: row.connectedAt }
        : { available: true, connected: false, email: null, connectedAt: null };
    });
  }

  async disconnect(identity: SessionIdentity): Promise<void> {
    await withTenantTransaction(this.pool, identity, async (client) => {
      await client.query("delete from gmail_integrations where company_id=$1", [identity.companyId]);
    });
  }

  get callbackPath(): string {
    return new URL(this.config.redirectUri).pathname;
  }

  get frontendMoreUrl(): string {
    return new URL("/mas", this.config.frontendUrl).toString();
  }
}
