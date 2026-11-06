import type { IncomingMessage } from "node:http";
import type { Pool } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { withTenantTransaction } from "../database/client.js";
import { HttpError } from "../http/errors.js";
import { readJson } from "../http/request.js";
import {
  evaluatePartnerRequest,
  isIsoDate,
  PARTNER_ROLE,
  resolveHistoryFrom,
  visibleDocument,
  type DocumentKind,
} from "./partner-policy.js";

export interface DocumentInfo {
  id: string;
  issueDate: string;
  status: string;
}

/** Consulta mínima (con aislamiento por empresa/RLS) de la fecha y estado de documentos. */
export interface DocumentLookup {
  find(identity: SessionIdentity, kind: DocumentKind, ids: string[]): Promise<DocumentInfo[]>;
}

export function createDocumentLookup(pool: Pool): DocumentLookup {
  return {
    async find(identity, kind, ids) {
      if (!ids.length) return [];
      const table = kind === "invoice" ? "invoices" : "delivery_notes";
      return withTenantTransaction(pool, identity, async (client) => {
        const result = await client.query<DocumentInfo>(
          `select id::text, issue_date::text "issueDate", status::text status from ${table} where id = any($1::uuid[])`,
          [ids],
        );
        return result.rows;
      });
    },
  };
}

export const BODY_CACHE_KEY = "factupapaParsedBody";

export function resolveGuardHistoryFrom(env: NodeJS.ProcessEnv = process.env): string {
  return resolveHistoryFrom(env.PARTNER_HISTORY_FROM?.trim());
}

/**
 * Aplica la política del rol `partner`. Para el resto de roles no hace nada.
 * Se ejecuta ANTES de los handlers: si lanza, la petición no llega a ellos.
 * Puede reescribir `url.searchParams` (recorte de fechas).
 */
export async function enforceRoleAccess(options: {
  request: IncomingMessage;
  url: URL;
  identity: SessionIdentity;
  documents?: DocumentLookup | undefined;
  historyFrom: string;
  today: string;
}): Promise<void> {
  const { request, url, identity, documents, historyFrom, today } = options;
  if (identity.role !== PARTNER_ROLE) return;

  const decision = evaluatePartnerRequest(request.method ?? "GET", url.pathname, url.searchParams, {
    historyFrom,
    today,
  });
  if (!decision.allowed || decision.periodDenied) throw new HttpError("forbidden", 403);

  for (const [key, value] of Object.entries(decision.query ?? {})) url.searchParams.set(key, value);

  if (decision.document) {
    if (!documents) throw new HttpError("forbidden", 403);
    const { kind, id, mode } = decision.document;
    const [found] = await documents.find(identity, kind, [id]);
    if (!found || !visibleDocument(found.issueDate, historyFrom)) throw new HttpError("not_found", 404);
    if (mode === "edit" && found.status !== "draft") throw new HttpError("forbidden", 403);
  }

  if (decision.body) {
    // Se lee una sola vez y se deja en caché para que el handler (readJson) no tenga que releerlo.
    const body = await readJson(request, 1_000_000);
    Reflect.set(request, BODY_CACHE_KEY, body);
    if (decision.body === "invoice_from_delivery_notes") {
      if (!documents) throw new HttpError("forbidden", 403);
      const ids = Array.isArray(body.deliveryNoteIds) ? body.deliveryNoteIds : [];
      const valid = ids.filter((value): value is string => typeof value === "string" && /^[0-9a-fA-F-]{36}$/.test(value));
      if (!valid.length || valid.length !== ids.length) throw new HttpError("invalid_request", 400);
      const found = await documents.find(identity, "delivery_note", valid.map((value) => value.toLowerCase()));
      if (found.length !== new Set(valid.map((value) => value.toLowerCase())).size) throw new HttpError("not_found", 404);
      if (found.some((note) => !visibleDocument(note.issueDate, historyFrom))) throw new HttpError("not_found", 404);
    }
    const requestedDate = body.issueDate;
    if (requestedDate !== undefined && requestedDate !== null) {
      if (!isIsoDate(requestedDate) || !visibleDocument(requestedDate, historyFrom)) {
        throw new HttpError("forbidden", 403);
      }
    }
  }
}
