import {
  createDecipheriv,
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
import { HttpError } from "../http/errors.js";
import { InvoiceRepository } from "../invoices/repository.js";
import { createInvoicePdf } from "../invoices/pdf.js";

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

export interface GmailSendResult {
  sent: true;
  email: string;
  messageId: string;
}

interface GmailMessageInput {
  from: string;
  to: string;
  subject: string;
  body: string;
  filename: string;
  pdf: Buffer;
}

function base64Lines(value: Buffer): string {
  return value.toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function safeFilename(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "factura.pdf";
}

export function createGmailRawMessage(input: GmailMessageInput): string {
  const boundary = `factupapa-${randomBytes(18).toString("hex")}`;
  const subject = `=?UTF-8?B?${Buffer.from(input.subject, "utf8").toString("base64")}?=`;
  const filename = safeFilename(input.filename);
  const message = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(Buffer.from(input.body, "utf8")),
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${filename}"`,
    "",
    base64Lines(input.pdf),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return Buffer.from(message, "utf8").toString("base64url");
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
  private readonly invoices = new InvoiceRepository();

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

  private decrypt(value: string): string {
    const parts = value.split(".");
    if (parts.length !== 3) throw new HttpError("gmail_reauthorization_required", 409);
    try {
      const [iv, tag, encrypted] = parts.map((part) => Buffer.from(part, "base64url"));
      const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, iv!);
      decipher.setAuthTag(tag!);
      return Buffer.concat([decipher.update(encrypted!), decipher.final()]).toString("utf8");
    } catch {
      throw new HttpError("gmail_reauthorization_required", 409);
    }
  }

  private async accessToken(refreshToken: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new HttpError("gmail_send_failed", 502);
    }
    if (!response.ok) throw new HttpError("gmail_reauthorization_required", 409);
    const payload = (await response.json()) as { access_token?: unknown };
    if (typeof payload.access_token !== "string")
      throw new HttpError("gmail_reauthorization_required", 409);
    return payload.access_token;
  }

  async sendInvoice(identity: SessionIdentity, invoiceId: string): Promise<GmailSendResult> {
    const prepared = await withTenantTransaction(this.pool, identity, async (client) => {
      const invoice = await this.invoices.get(client, invoiceId);
      if (!invoice) throw new HttpError("not_found", 404);
      if (invoice.status !== "issued") throw new HttpError("conflict", 409);
      const recipient = invoice.contactEmail?.trim().toLowerCase();
      if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
        throw new HttpError("gmail_recipient_missing", 409);
      const integration = await client.query<{
        googleEmail: string;
        encryptedRefreshToken: string;
      }>(
        `select google_email "googleEmail",encrypted_refresh_token "encryptedRefreshToken"
         from gmail_integrations where company_id=$1`,
        [identity.companyId],
      );
      const connection = integration.rows[0];
      if (!connection) throw new HttpError("gmail_not_connected", 409);
      const pdf = await createInvoicePdf(invoice, {
        name: invoice.issuerLegalName,
        taxId: invoice.issuerTaxId,
        address: invoice.issuerAddress,
      });
      if (pdf.length > 5_000_000) throw new HttpError("payload_too_large", 413);
      const documentNumber = `${invoice.series}-${invoice.number}`;
      return {
        refreshToken: this.decrypt(connection.encryptedRefreshToken),
        from: connection.googleEmail,
        to: recipient,
        raw: createGmailRawMessage({
          from: connection.googleEmail,
          to: recipient,
          subject: `Factura ${documentNumber} · ${invoice.issuerLegalName}`,
          body: `Hola ${invoice.contactLegalName},\n\nAdjuntamos la factura ${documentNumber} en PDF.\n\nUn saludo,\n${invoice.issuerLegalName}`,
          filename: `factura-${documentNumber}.pdf`,
          pdf,
        }),
      };
    });

    const token = await this.accessToken(prepared.refreshToken);
    let response: Response;
    try {
      response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ raw: prepared.raw }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new HttpError("gmail_send_failed", 502);
    }
    if (!response.ok) throw new HttpError("gmail_send_failed", 502);
    const payload = (await response.json()) as { id?: unknown };
    if (typeof payload.id !== "string") throw new HttpError("gmail_send_failed", 502);
    return { sent: true, email: prepared.to, messageId: payload.id };
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
