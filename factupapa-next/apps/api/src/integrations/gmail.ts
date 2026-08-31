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
import type { FinanceService } from "../finance/service.js";

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
  canRead: boolean;
  canWriteDrive: boolean;
  canWriteSheets: boolean;
  lastInboxSyncAt: string | null;
  lastInboxSyncStatus: string | null;
  nextInboxSyncAt?: string | null;
  inboxCursorAt?: string | null;
  lastInboxMetrics?: {
    messages: number;
    imported: number;
    duplicates: number;
    review: number;
    errors: number;
  } | null;
}

interface GmailPart {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; data?: string; size?: number };
  headers?: Array<{ name?: string; value?: string }>;
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  internalDate?: string;
  payload?: GmailPart & { headers?: Array<{ name?: string; value?: string }> };
  snippet?: string;
}

export interface GmailInboxSyncResult {
  messages: number;
  messagesScanned: number;
  attachmentsSeen: number;
  ignored: number;
  candidates: number;
  autoImported: number;
  imported: number;
  duplicates: number;
  review: number;
  failed: number;
  ignoredSelf: number;
  truncated: boolean;
  messagesRelevant: number;
  attachmentsDownloaded: number;
  autoImportable: number;
  errors: number;
  ocrUsed: number;
  visionUsed: number;
  ocrFallback: number;
  estimatedAiCost: number;
  ignoredReasons: Record<string, number>;
  reviewReasons: Record<string, number>;
  errorReasons: Record<string, number>;
  candidatesAudit?: Array<Record<string, unknown>>;
}

export interface GmailInboxSyncOptions {
  dryRun?: boolean;
  lookbackDays?: number;
}

export type GmailDocumentDecision = "auto_import" | "review" | "ignore";

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

const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const GMAIL_OVERLAP_MS = 2 * 60 * 60 * 1000;
const GMAIL_INITIAL_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const GMAIL_MAX_MESSAGES_PER_RUN = 500;
const GMAIL_MAX_ATTACHMENTS_PER_RUN = 100;
const MIME_TO_DOCUMENT_MIME = new Map<string, string>([
  ["application/pdf", "application/pdf"],
  ["image/jpeg", "image/jpeg"],
  ["image/jpg", "image/jpeg"],
  ["image/png", "image/png"],
]);
const EXTENSION_TO_DOCUMENT_MIME = new Map<string, string>([
  ["pdf", "application/pdf"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
]);

export function normalizedGmailAttachmentMime(part: GmailPart): string | null {
  const filename = part.filename?.trim() ?? "";
  if (!filename) return null;
  const extension = filename.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase();
  const byExtension = extension ? EXTENSION_TO_DOCUMENT_MIME.get(extension) : undefined;
  const rawMime = part.mimeType?.trim().toLowerCase() ?? "";
  const byMime = MIME_TO_DOCUMENT_MIME.get(rawMime);
  if (byExtension) {
    if (!byMime) return byExtension;
    return byMime === byExtension ? byExtension : null;
  }
  return byMime ?? null;
}

function attachmentDisposition(part: GmailPart): string {
  return part.headers?.find((h) => h.name?.toLowerCase() === "content-disposition")?.value?.toLowerCase() ?? "";
}

function decorativeFilename(filename: string): boolean {
  return /(?:^|[-_. ])(?:logo|icon|icono|banner|signature|firma|avatar|tracking|pixel|qr)(?:[-_. ]|$)/i.test(filename);
}

export function isPlausibleGmailAttachment(part: GmailPart): boolean {
  const filename = part.filename?.trim() ?? "";
  const mime = normalizedGmailAttachmentMime(part);
  if (!mime || decorativeFilename(filename)) return false;
  const disposition = attachmentDisposition(part);
  if (disposition.startsWith("inline") && mime !== "application/pdf" && !part.body?.attachmentId && !part.body?.data)
    return false;
  if (mime.startsWith("image/") && part.body?.size != null && part.body.size < 8_000 && disposition.startsWith("inline"))
    return false;
  return true;
}

export function collectGmailPurchaseAttachments(
  part: GmailPart | undefined,
  output: GmailPart[] = [],
): GmailPart[] {
  if (!part) return output;
  if (isPlausibleGmailAttachment(part)) output.push(part);
  for (const child of part.parts ?? []) collectGmailPurchaseAttachments(child, output);
  return output;
}

/** Maps the existing fiscal classifier output to the Gmail decision contract. */
export function decideGmailDocument(extracted: Record<string, unknown>): GmailDocumentDecision {
  if (extracted.documentType !== "supplier_invoice")
    return extracted.documentType === "supplier_credit_note" ? "review" : "ignore";
  const confidence = typeof extracted.classificationConfidence === "number" ? extracted.classificationConfidence : 0;
  const eligible = extracted.purchaseEligible === true;
  if (eligible && confidence >= 0.8 && extracted.supplierTaxId && extracted.issueDate && extracted.total && extracted.supplierInvoiceNumber)
    return "auto_import";
  const signals = [extracted.supplierTaxId, extracted.supplierName, extracted.supplierInvoiceNumber, extracted.issueDate, extracted.total].filter(Boolean).length;
  return signals >= 2 ? "review" : "ignore";
}

export function shouldIgnoreGmailMessage(message: GmailMessage): boolean {
  const text = `${senderEmail(header(message, "from")) ?? ""} ${header(message, "subject") ?? ""} ${message.snippet ?? ""}`.toLowerCase();
  if (/factura|invoice|fiscal|iva|proveedor|supplier|albar[aá]n|receipt/.test(text)) return false;
  return /github|gitlab|newsletter|unsubscribe|marketing|promo(?:tion|ci[oó]n)|social|security alert|alerta|notification|notificaci[oó]n|confirmaci[oó]n|no[- ]?reply/.test(text);
}

function header(message: GmailMessage, name: string): string | null {
  return message.payload?.headers?.find((item) => item.name?.toLowerCase() === name)?.value ?? null;
}

function senderEmail(value: string | null): string | null {
  if (!value) return null;
  const bracketed = value.match(/<([^>]+)>/);
  const email = (bracketed?.[1] ?? value).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
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
      `openid email https://www.googleapis.com/auth/gmail.send ${GMAIL_READ_SCOPE} ${GOOGLE_DRIVE_SCOPE} ${GOOGLE_SHEETS_SCOPE}`,
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

  async accessToken(refreshToken: string): Promise<string> {
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
      const result = await client.query<{
        googleEmail: string;
        connectedAt: string;
        scopes: string[];
        lastInboxSyncAt: string | null;
        lastInboxSyncStatus: string | null;
        inboxCursorAt: string | null;
        lastInboxMessages: number;
        lastInboxImported: number;
        lastInboxDuplicates: number;
        lastInboxReview: number;
        lastInboxErrors: number;
      }>(
        `select google_email "googleEmail",connected_at::text "connectedAt",scopes,
           last_inbox_sync_at::text "lastInboxSyncAt",
           last_inbox_sync_status "lastInboxSyncStatus",
           inbox_cursor_at::text "inboxCursorAt",
           last_inbox_messages "lastInboxMessages",
           last_inbox_imported "lastInboxImported",
           last_inbox_duplicates "lastInboxDuplicates",
           last_inbox_review "lastInboxReview",
           last_inbox_errors "lastInboxErrors"
         from gmail_integrations where company_id=$1`,
        [identity.companyId],
      );
      const row = result.rows[0];
      return row
        ? {
            available: true,
            connected: true,
            email: row.googleEmail,
            connectedAt: row.connectedAt,
            canRead: row.scopes.includes(GMAIL_READ_SCOPE),
            canWriteDrive: row.scopes.includes(GOOGLE_DRIVE_SCOPE),
            canWriteSheets: row.scopes.includes(GOOGLE_SHEETS_SCOPE),
            lastInboxSyncAt: row.lastInboxSyncAt,
            lastInboxSyncStatus: row.lastInboxSyncStatus,
            nextInboxSyncAt: row.lastInboxSyncAt
              ? new Date(new Date(row.lastInboxSyncAt).getTime() + 6 * 60 * 60 * 1000).toISOString()
              : null,
            inboxCursorAt: row.inboxCursorAt,
            lastInboxMetrics: {
              messages: row.lastInboxMessages,
              imported: row.lastInboxImported,
              duplicates: row.lastInboxDuplicates,
              review: row.lastInboxReview,
              errors: row.lastInboxErrors,
            },
          }
        : {
            available: true,
            connected: false,
            email: null,
            connectedAt: null,
            canRead: false,
            canWriteDrive: false,
            canWriteSheets: false,
            lastInboxSyncAt: null,
            lastInboxSyncStatus: null,
            nextInboxSyncAt: null,
            inboxCursorAt: null,
            lastInboxMetrics: null,
          };
    });
  }

  async googleAccess(identity: TenantContext): Promise<{ token: string; scopes: string[]; email: string }> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const row = (await client.query<{ encrypted: string; scopes: string[]; email: string }>(
        `select encrypted_refresh_token encrypted, scopes, google_email email from gmail_integrations where company_id=$1`,
        [identity.companyId],
      )).rows[0];
      if (!row) throw new HttpError("gmail_not_connected", 409);
      return { token: await this.accessToken(this.decrypt(row.encrypted)), scopes: row.scopes, email: row.email };
    });
  }

  private async gmailJson<T>(token: string, path: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new HttpError("gmail_send_failed", 502);
    }
    if (response.status === 401 || response.status === 403)
      throw new HttpError("gmail_reauthorization_required", 409);
    if (!response.ok) throw new HttpError("gmail_send_failed", 502);
    return (await response.json()) as T;
  }

  async syncInbox(identity: SessionIdentity, finance: FinanceService, options: GmailInboxSyncOptions = {}): Promise<GmailInboxSyncResult> {
    const dryRun = options.dryRun === true;
    const connection = await withTenantTransaction(this.pool, identity, async (client) =>
      (
        await client.query<{
          encryptedRefreshToken: string;
          scopes: string[];
          googleEmail: string;
          inboxCursorAt: string | null;
        }>(
          `select encrypted_refresh_token "encryptedRefreshToken",scopes,
             google_email "googleEmail",inbox_cursor_at::text "inboxCursorAt"
           from gmail_integrations where company_id=$1`,
          [identity.companyId],
        )
      ).rows[0],
    );
    if (!connection) throw new HttpError("gmail_not_connected", 409);
    if (!connection.scopes.includes(GMAIL_READ_SCOPE))
      throw new HttpError("gmail_reauthorization_required", 409);
    const token = await this.accessToken(this.decrypt(connection.encryptedRefreshToken));
    const nowMs = Date.now();
    const cursorMs = connection.inboxCursorAt
      ? Date.parse(connection.inboxCursorAt)
      : nowMs - GMAIL_INITIAL_LOOKBACK_MS;
    const safeCursorMs = Number.isFinite(cursorMs) ? cursorMs : nowMs - GMAIL_INITIAL_LOOKBACK_MS;
    const historicalLookbackMs = dryRun && options.lookbackDays !== undefined
      ? options.lookbackDays * 24 * 60 * 60 * 1000
      : undefined;
    const windowStartMs = historicalLookbackMs === undefined
      ? Math.max(
          nowMs - 30 * 24 * 60 * 60 * 1000,
          safeCursorMs - GMAIL_OVERLAP_MS,
        )
      : nowMs - Math.min(historicalLookbackMs, 30 * 24 * 60 * 60 * 1000);
    const lookbackDays = Math.max(
      1,
      Math.min(30, Math.ceil((nowMs - windowStartMs) / (24 * 60 * 60 * 1000)) + 1),
    );
    const query = encodeURIComponent(
      `newer_than:${lookbackDays}d has:attachment -in:sent -in:drafts -in:trash -in:spam -from:${connection.googleEmail} (filename:pdf OR filename:jpg OR filename:jpeg OR filename:png)`,
    );
    const ids: string[] = [];
    let pageToken: string | undefined;
    let mailboxTruncated = false;
    do {
      const listed = await this.gmailJson<{
        messages?: Array<{ id?: string }>;
        nextPageToken?: string;
      }>(
        token,
        `/messages?q=${query}&maxResults=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
      );
      ids.push(...(listed.messages ?? []).flatMap((item) => item.id ? [item.id] : []));
      pageToken = listed.nextPageToken;
      if (ids.length >= GMAIL_MAX_MESSAGES_PER_RUN && pageToken) {
        mailboxTruncated = true;
        break;
      }
    } while (pageToken);

    const result: GmailInboxSyncResult = {
      messages: 0,
      messagesScanned: 0,
      attachmentsSeen: 0,
      ignored: 0,
      candidates: 0,
      autoImported: 0,
      imported: 0,
      duplicates: 0,
      review: 0,
      failed: 0,
      ignoredSelf: 0,
      truncated: mailboxTruncated,
      messagesRelevant: 0,
      attachmentsDownloaded: 0,
      autoImportable: 0,
      errors: 0,
      ocrUsed: 0,
      visionUsed: 0,
      ocrFallback: 0,
      estimatedAiCost: 0,
      ignoredReasons: {},
      reviewReasons: {},
      errorReasons: {},
      ...(dryRun ? { candidatesAudit: [] } : {}),
    };
    const incrementReason = (bucket: Record<string, number>, reason: string) => {
      bucket[reason] = (bucket[reason] ?? 0) + 1;
    };
    let processed = 0;
    for (const messageId of ids.slice(0, GMAIL_MAX_MESSAGES_PER_RUN)) {
      const message = await this.gmailJson<GmailMessage>(token, `/messages/${messageId}?format=full`);
      const receivedMs = Number(message.internalDate ?? 0);
      if (!Number.isFinite(receivedMs) || receivedMs < windowStartMs || receivedMs > nowMs) continue;
      result.messages += 1;
      result.messagesScanned += 1;
      const from = senderEmail(header(message, "from"));
      if (from && from === connection.googleEmail.trim().toLowerCase()) {
        result.ignoredSelf += 1;
        continue;
      }
      if (shouldIgnoreGmailMessage(message)) {
        result.ignored += 1;
        incrementReason(result.ignoredReasons, "generic_notification");
        continue;
      }
      result.messagesRelevant += 1;
      const parts = collectGmailPurchaseAttachments(message.payload);
      let partIndex = 0;
      for (const part of parts) {
        if (processed >= GMAIL_MAX_ATTACHMENTS_PER_RUN) {
          result.truncated = true;
          break;
        }
        partIndex += 1;
        const filename = part.filename!.trim();
        const mimeType = normalizedGmailAttachmentMime(part);
        if (!mimeType) continue;
        result.attachmentsSeen += 1;
        const attachmentKey = part.body?.attachmentId ?? `inline-${partIndex}-${filename}`;
        // Look up the import in every mode.  A needs_review/failed import is
        // explicitly replayable: its source document must be re-extracted
        // before SHA idempotency is considered.  Dry-run only suppresses
        // writes; it must not change the processing semantics.
        const existingImport = await withTenantTransaction(this.pool, identity, async (client) =>
          (await client.query<{ id: string; status: string; documentId: string | null; documentStatus: string | null }>(
            `select g.id,g.status,g.document_id "documentId",d.status "documentStatus"
               from gmail_purchase_imports g
               left join documents d on d.id=g.document_id
              where g.company_id=$1 and g.gmail_message_id=$2 and g.gmail_attachment_id=$3
              order by case when g.status in ('needs_review','failed') then 0 else 1 end, g.updated_at desc`,
            [identity.companyId, messageId, attachmentKey],
          )).rows[0]
        );
        if (dryRun && existingImport && ["imported", "needs_review", "ignored", "duplicate"].includes(existingImport.status)) {
          result.duplicates += 1;
          continue;
        }
        const retryableImport = existingImport?.status === "failed" || existingImport?.status === "needs_review" ||
          (Boolean(existingImport?.documentId) && !["validated", "rejected", "archived"].includes(String(existingImport?.documentStatus ?? "")));
        const claimed = dryRun
          ? { id: "dry-run" }
          : retryableImport && existingImport
            ? existingImport
            : await withTenantTransaction(this.pool, identity, async (client) =>
          (
            await client.query<{ id: string }>(
              `insert into gmail_purchase_imports(
                 company_id,gmail_message_id,gmail_attachment_id,sender_email,subject,
                 received_at,original_filename,status)
               values($1,$2,$3,$4,$5,to_timestamp($6::double precision / 1000),$7,'processing')
               on conflict(company_id,gmail_message_id,gmail_attachment_id) do update
                 set status='processing',error_code=null,updated_at=now()
                 where gmail_purchase_imports.status in ('failed','needs_review')
                    or gmail_purchase_imports.updated_at < now() - interval '2 hours'
               returning id`,
              [
                identity.companyId,
                messageId,
                attachmentKey,
                from,
                header(message, "subject"),
                receivedMs,
                filename,
              ],
            )
          ).rows[0],
        );
        if (!claimed) continue;
        processed += 1;
        let stage = "attachment";
        try {
          const encodedBody = part.body?.attachmentId
            ? (
                await this.gmailJson<{ data?: string }>(
                  token,
                  `/messages/${messageId}/attachments/${part.body.attachmentId}`,
                )
              ).data
            : part.body?.data;
          if (!encodedBody) throw new Error("gmail_attachment_empty");
          const body = Buffer.from(encodedBody, "base64url");
          result.attachmentsDownloaded += 1;
          const sha = createHash("sha256").update(body).digest("hex");
          // A failed/review import must be allowed to re-extract the source
          // document after parser improvements. Finalized imports keep the
          // normal SHA idempotency shortcut.
          const shaDocument = await finance.findPurchaseDocumentBySha(identity, sha);
          // Historical rows can have lost their message/attachment link while
          // retaining the source document.  If the SHA points at a document
          // still awaiting review, replay that exact document rather than
          // treating it as a finalized duplicate.
          const replayDocumentId = shaDocument
            ? (["needs_review", "validated"].includes(shaDocument.status) ? shaDocument.id : undefined)
            : existingImport?.documentId;
          const existing = replayDocumentId ? undefined : shaDocument;
          let status: "duplicate" | "needs_review" | "imported" = existing ? "duplicate" : "needs_review";
          let document;
          stage = "upload";
          try {
            document = existing ?? (replayDocumentId && typeof finance.reprocessPurchaseDocument === "function"
              ? await finance.reprocessPurchaseDocument(identity, replayDocumentId)
              : await finance.uploadDocument(identity, {
              filename,
              mimeType,
              contentBase64: body.toString("base64"),
              persist: !dryRun,
            }));
          } catch (error) {
            const targetDocumentId = replayDocumentId ?? existingImport?.documentId;
            if (!(error instanceof HttpError) || error.code !== "conflict" || !retryableImport || !targetDocumentId) throw error;
            // Never create a second document for a historical retry.  The
            // original row remains the audit anchor; resolve its import as a
            // terminal duplicate and remove it from the review queue.
            status = "duplicate";
            result.duplicates += 1;
            const linked = await withTenantTransaction(this.pool, identity, async (client) => {
              const row = await client.query<{ count: string }>(`select count(*)::text count from purchase_invoices where document_id=$1`, [targetDocumentId]);
              return Number(row.rows[0]?.count ?? 0) > 0;
            });
            if (!linked) throw error;
            await withTenantTransaction(this.pool, identity, async (client) => {
              await client.query(`update documents set status='validated',updated_at=now() where id=$1 and status='needs_review'`, [targetDocumentId]);
              await client.query(`update gmail_purchase_imports set document_id=$2,status='duplicate',error_code=null,updated_at=now() where id=$1`, [claimed.id, targetDocumentId]);
            });
            continue;
          }
          stage = "classification";
          const decision = existing ? "duplicate" : decideGmailDocument((document as { extractedData?: Record<string, unknown> }).extractedData ?? {});
          const extractedData = (document as { extractedData?: Record<string, unknown> }).extractedData ?? {};
          const source = String(extractedData.source ?? "");
          if (source === "vision") result.visionUsed += 1;
          if (source === "ocr") result.ocrUsed += 1;
          if (source === "ocr" && (extractedData.warnings as unknown[] | undefined)?.some((warning) => String(warning).startsWith("vision_"))) result.ocrFallback += 1;
          if (source === "vision") result.estimatedAiCost += 0.01;
          if (!existing && decision === "ignore") {
            if (!dryRun) {
              await finance.rejectPendingDocument(identity, document.id);
              await withTenantTransaction(this.pool, identity, async (client) => {
                await client.query(`update gmail_purchase_imports set document_id=$2,status='ignored',updated_at=now() where id=$1`, [claimed.id, document.id]);
              });
            }
            result.ignored += 1;
            incrementReason(result.ignoredReasons, String(extractedData.documentType ?? "not_invoice_like"));
            continue;
          }
          if (!existing) result.candidates += 1;
          if (!existing && decision === "auto_import") {
            const data = (document as { extractedData?: Record<string, unknown> }).extractedData ?? {};
            let supplier = data.supplierTaxId
              ? (await withTenantTransaction(this.pool, identity, async (client) => (await client.query<{ id: string }>(
                  `select id from contacts where is_active and kind in ('supplier','both') and upper(regexp_replace(coalesce(tax_id,''),'[^A-Z0-9]','','g'))=upper(regexp_replace($1,'[^A-Z0-9]','','g')) limit 1`, [String(data.supplierTaxId)]
                )).rows[0]))
              : undefined;
            // A supplier with a strong fiscal identity can be onboarded safely
            // on the real sync. Dry-runs only model this outcome in memory.
            if (!supplier && data.supplierTaxId && data.supplierName && Number(data.classificationConfidence ?? 0) >= 0.82) {
              supplier = dryRun
                ? { id: "dry-run-supplier" }
                : await withTenantTransaction(this.pool, identity, async (client) =>
                    (await client.query<{ id: string }>(
                      `insert into contacts(company_id,kind,legal_name,tax_id,address)
                       values($1,'supplier',$2,$3,'{}'::jsonb)
                       on conflict (company_id,lower(btrim(tax_id))) where tax_id is not null and btrim(tax_id) <> ''
                       do update set is_active=true
                       returning id`,
                      [identity.companyId, String(data.supplierName).slice(0, 200), String(data.supplierTaxId)],
                    )).rows[0]
                  );
            }
            const lines = Array.isArray(data.lines) ? data.lines.filter((line): line is Record<string, unknown> => Boolean(line && typeof line === "object")) : [];
            if (supplier && lines.length && data.issueDate && data.total) {
              const existingPurchase = data.supplierTaxId && data.supplierInvoiceNumber
                ? await finance.findPurchaseByInvoiceIdentity?.(identity, String(data.supplierTaxId), String(data.supplierInvoiceNumber), String(data.issueDate))
                : null;
              if (existingPurchase) {
                status = "duplicate";
                result.duplicates += 1;
                await withTenantTransaction(this.pool, identity, async (client) => {
                  await client.query(`update documents set status='validated',updated_at=now() where id=$1 and status='needs_review'`, [document.id]);
                  if (existingImport?.documentId && existingImport.documentId !== document.id)
                    await client.query(`update documents set status='validated',updated_at=now() where id=$1 and status='needs_review'`, [existingImport.documentId]);
                });
              } else {
              result.autoImportable += 1;
              if (dryRun) {
                result.candidatesAudit?.push({ gmailMessageId: messageId, attachmentIndex: partIndex, filename, mimeType, sha256: sha, decision: "AUTO_IMPORT", documentType: data.documentType, confidence: data.classificationConfidence ?? null, supplierNameMasked: data.supplierName ? `${String(data.supplierName).slice(0, 2)}***` : null, invoiceNumberMasked: data.supplierInvoiceNumber ? `***${String(data.supplierInvoiceNumber).slice(-4)}` : null, invoiceDate: data.issueDate, total: data.total, vat: data.taxTotal });
              } else {
              try {
                stage = "create_purchase";
                await finance.createPurchase(identity, {
                  supplierId: supplier.id,
                  documentId: document.id,
                  supplierInvoiceNumber: data.supplierInvoiceNumber ? String(data.supplierInvoiceNumber) : null,
                  issueDate: String(data.issueDate),
                  dueDate: data.dueDate ? String(data.dueDate) : null,
                  category: "mercancia",
                  notes: "Importada automáticamente desde Gmail",
                  status: "confirmed",
                  lines: lines.map((line) => ({
                    productId: null,
                    description: String(line.description ?? data.concept ?? "Compra"),
                    quantity: String(line.quantity ?? "1"),
                    unit: String(line.unit ?? "unit"),
                    unitCost: String(line.unitCost ?? "0"),
                    taxRate: String(line.taxRate ?? "0"),
                  })),
                });
              } catch (error) {
                if (!(error instanceof HttpError) || error.code !== "conflict") throw error;
                status = "duplicate";
                result.duplicates += 1;
              }
              if (status === "duplicate") {
                await withTenantTransaction(this.pool, identity, async (client) => {
                  await client.query(`update documents set status='validated',updated_at=now() where id=$1 and status='needs_review'`, [document.id]);
                });
              } else {
                // A successfully imported document is no longer pending human
                // review.  Keeping it validated also prevents later Gmail
                // messages with the same SHA from replaying it indefinitely.
                await withTenantTransaction(this.pool, identity, async (client) => {
                  await client.query(`update documents set status='validated',updated_at=now() where id=$1 and status='needs_review'`, [document.id]);
                });
                status = "imported";
                result.autoImported += 1;
              }
              }
              // Dry-run records the same final decision without counting it as
              // a persisted import or placing it in the review queue.
              if (status !== "duplicate") status = "imported";
              }
            }
          }
          if (!dryRun) await withTenantTransaction(this.pool, identity, async (client) => {
            await client.query(`update gmail_purchase_imports set document_id=$2,status=$3,updated_at=now() where id=$1`, [claimed.id, document.id, status]);
          });
          if (existing) result.duplicates += 1;
          else if (status === "needs_review") {
            result.review += 1;
            incrementReason(result.reviewReasons, "probable_supplier_invoice_ambiguous");
            result.candidatesAudit?.push({ gmailMessageId: messageId, attachmentIndex: partIndex, filename, mimeType, sha256: sha, decision: "REVIEW", documentType: extractedData.documentType ?? "unknown", reasons: ["probable_supplier_invoice_ambiguous"] });
          } else if (status === "imported" && !dryRun) {
            result.imported += 1;
          }
        } catch (error) {
          result.failed += 1;
          result.errors += 1;
          const errorReason = error instanceof HttpError ? error.code : error instanceof Error ? error.message.replace(/[^a-zA-Z0-9_:-]/g, "_").slice(0, 80) : "gmail_import_failed";
          incrementReason(result.errorReasons, `${stage}_${errorReason}`);
          if (!dryRun) await withTenantTransaction(this.pool, identity, async (client) => {
            await client.query(
              `update gmail_purchase_imports set status='failed',error_code=$2,updated_at=now()
               where id=$1`,
              [claimed.id, error instanceof HttpError ? error.code : "gmail_import_failed"],
            );
          });
        }
      }
      if (result.truncated && processed >= GMAIL_MAX_ATTACHMENTS_PER_RUN) break;
    }
    const advanceCursor = result.failed === 0 && !result.truncated;
    if (!dryRun) await withTenantTransaction(this.pool, identity, async (client) => {
      await client.query(
        `update gmail_integrations set
           last_inbox_sync_at=now(),last_inbox_sync_status=$2,last_inbox_sync_error=null,
           inbox_cursor_at=case when $3 then to_timestamp($4::double precision / 1000) else inbox_cursor_at end,
           last_inbox_messages=$5,last_inbox_imported=$6,last_inbox_duplicates=$7,
           last_inbox_review=$8,last_inbox_errors=$9,updated_at=now()
         where company_id=$1`,
        [
          identity.companyId,
          result.failed ? "completed_with_errors" : result.truncated ? "partial" : "completed",
          advanceCursor,
          nowMs,
          result.messages,
          result.imported,
          result.duplicates,
          result.review,
          result.failed,
        ],
      );
    });
    return result;
  }

  async syncDueInboxes(finance: FinanceService): Promise<void> {
    const due = await this.pool.query<{ companyId: string; userId: string }>(
      `select company_id "companyId",user_id "userId"
       from claim_due_gmail_inbox_syncs(20)`,
    );
    for (const row of due.rows) {
      const identity: SessionIdentity = {
        companyId: row.companyId,
        userId: row.userId,
        email: "gmail-scheduler@factupapa.local",
        displayName: "Sincronización Gmail",
        companyName: "FactuPapa",
        role: "system",
        familyId: "gmail-scheduler",
      };
      await this.syncInbox(identity, finance).catch(async (error) => {
        await withTenantTransaction(this.pool, identity, async (client) => {
          await client.query(
            `update gmail_integrations set last_inbox_sync_status='failed',
               last_inbox_sync_error=$2,last_inbox_errors=greatest(last_inbox_errors,1),
               updated_at=now() where company_id=$1`,
            [identity.companyId, error instanceof HttpError ? error.code : "gmail_sync_failed"],
          );
        });
      });
    }
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
