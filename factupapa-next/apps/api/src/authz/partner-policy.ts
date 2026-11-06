/**
 * Política de acceso del rol "partner" (socio).
 *
 * Reglas (decididas por el dueño):
 *  - Solo el usuario maestro (rol `owner`) lo ve y lo modifica todo.
 *  - Un socio puede ver resumen, alertas, pendientes y crear facturas y albaranes.
 *  - Un socio NO ve datos de facturación anteriores a `historyFrom` (por defecto 2026-11-01).
 *  - Precios, clientes, proveedores, compras, gastos, stock, importaciones,
 *    integraciones, gestoría y ajustes son solo del maestro.
 *
 * Esta función es PURA y fail-closed: todo lo que no esté listado aquí se deniega,
 * también los endpoints que se añadan en el futuro.
 */

export const DEFAULT_PARTNER_HISTORY_FROM = "2026-11-01";
export const PARTNER_ROLE = "partner";
export const OWNER_ROLE = "owner";

export type DocumentKind = "invoice" | "delivery_note";

export type PartnerBodyCheck =
  | "invoice_create"
  | "delivery_note_create"
  | "invoice_from_delivery_notes";

export type PartnerDecision =
  | { allowed: false; code: "forbidden" }
  | {
      allowed: true;
      /** Parámetros de query que se fuerzan antes de llegar al handler. */
      query?: Record<string, string>;
      /** Si es true, la petición se deniega con "forbidden" (periodo no permitido). */
      periodDenied?: boolean;
      /** Documento sobre el que actúa la petición (se comprueba contra la base de datos). */
      document?: { kind: DocumentKind; id: string; mode: "read" | "edit" };
      /** Comprobación sobre el cuerpo JSON de la petición. */
      body?: PartnerBodyCheck;
    };

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function resolveHistoryFrom(value: string | undefined): string {
  return isIsoDate(value) ? value : DEFAULT_PARTNER_HISTORY_FROM;
}

/** Devuelve la fecha más tardía entre `requested` (si es válida) y `historyFrom`. */
export function clampFrom(requested: string | null, historyFrom: string): string {
  if (!isIsoDate(requested)) return historyFrom;
  return requested < historyFrom ? historyFrom : requested;
}

/** Meses (incluido el actual) que quedan dentro del periodo visible. */
export function visibleMonths(historyFrom: string, today: string): number {
  const fromYear = Number(historyFrom.slice(0, 4));
  const fromMonth = Number(historyFrom.slice(5, 7));
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const months = (year - fromYear) * 12 + (month - fromMonth) + 1;
  return Math.min(Math.max(months, 1), 24);
}

type Rule = {
  methods: readonly string[];
  pattern: RegExp;
  decide(match: RegExpMatchArray, query: URLSearchParams, context: Context): PartnerDecision;
};

interface Context {
  historyFrom: string;
  today: string;
}

const deny: PartnerDecision = { allowed: false, code: "forbidden" };
const plain: PartnerDecision = { allowed: true };
const listClamped = (_m: RegExpMatchArray, query: URLSearchParams, c: Context): PartnerDecision => ({
  allowed: true,
  query: { from: clampFrom(query.get("from"), c.historyFrom) },
});
const doc =
  (kind: DocumentKind, mode: "read" | "edit") =>
  (match: RegExpMatchArray): PartnerDecision => ({
    allowed: true,
    document: { kind, id: (match[1] as string).toLowerCase(), mode },
  });
const bodyCheck = (check: PartnerBodyCheck) => (): PartnerDecision => ({ allowed: true, body: check });

const GET = ["GET"] as const;

const rules: Rule[] = [
  // ── Sesión propia (la web averigua aquí el rol) ────────────────────────────
  { methods: GET, pattern: /^\/me$/, decide: () => plain },
  // ── Resumen / alertas / pendientes ─────────────────────────────────────────
  {
    methods: GET,
    pattern: /^\/finance\/summary$/,
    decide: (_m, query, c) => {
      const to = query.get("to");
      const periodDenied = isIsoDate(to) && to < c.historyFrom;
      return { allowed: true, periodDenied, query: { from: clampFrom(query.get("from"), c.historyFrom) } };
    },
  },
  {
    methods: GET,
    pattern: /^\/finance\/monthly$/,
    decide: (_m, query, c) => {
      const requested = Number(query.get("months") ?? 6);
      const wanted = Number.isInteger(requested) && requested >= 1 && requested <= 24 ? requested : 6;
      return { allowed: true, query: { months: String(Math.min(wanted, visibleMonths(c.historyFrom, c.today))) } };
    },
  },
  // ── Facturas ───────────────────────────────────────────────────────────────
  { methods: GET, pattern: /^\/invoices$/, decide: listClamped },
  { methods: GET, pattern: /^\/invoices\/number-preview$/, decide: () => plain },
  { methods: GET, pattern: new RegExp(`^/invoices/(${UUID})$`), decide: doc("invoice", "read") },
  { methods: GET, pattern: new RegExp(`^/invoices/(${UUID})/pdf$`), decide: doc("invoice", "read") },
  { methods: ["POST"], pattern: /^\/invoices$/, decide: bodyCheck("invoice_create") },
  { methods: ["POST"], pattern: /^\/invoices\/from-delivery-notes$/, decide: bodyCheck("invoice_from_delivery_notes") },
  { methods: ["PATCH"], pattern: new RegExp(`^/invoices/(${UUID})$`), decide: doc("invoice", "edit") },
  { methods: ["POST"], pattern: new RegExp(`^/invoices/(${UUID})/(?:issue|lines)$`), decide: doc("invoice", "edit") },
  { methods: ["PATCH", "DELETE"], pattern: new RegExp(`^/invoices/(${UUID})/lines/[^/]+$`), decide: doc("invoice", "edit") },
  // ── Albaranes ──────────────────────────────────────────────────────────────
  { methods: GET, pattern: /^\/delivery-notes$/, decide: listClamped },
  { methods: GET, pattern: /^\/delivery-notes\/number-preview$/, decide: () => plain },
  { methods: GET, pattern: new RegExp(`^/delivery-notes/(${UUID})$`), decide: doc("delivery_note", "read") },
  { methods: GET, pattern: new RegExp(`^/delivery-notes/(${UUID})/pdf$`), decide: doc("delivery_note", "read") },
  { methods: ["POST"], pattern: /^\/delivery-notes$/, decide: bodyCheck("delivery_note_create") },
  { methods: ["PATCH"], pattern: new RegExp(`^/delivery-notes/(${UUID})$`), decide: doc("delivery_note", "edit") },
  { methods: ["POST"], pattern: new RegExp(`^/delivery-notes/(${UUID})/(?:issue|lines)$`), decide: doc("delivery_note", "edit") },
  { methods: ["PATCH", "DELETE"], pattern: new RegExp(`^/delivery-notes/(${UUID})/lines/[^/]+$`), decide: doc("delivery_note", "edit") },
  // ── Catálogo en SOLO LECTURA (para poder elegir cliente y producto) ─────────
  { methods: GET, pattern: /^\/contacts$/, decide: () => plain },
  { methods: GET, pattern: new RegExp(`^/contacts/${UUID}$`), decide: () => plain },
  { methods: GET, pattern: new RegExp(`^/contacts/${UUID}/products$`), decide: () => plain },
  { methods: GET, pattern: /^\/products$/, decide: () => plain },
  { methods: GET, pattern: new RegExp(`^/products/${UUID}$`), decide: () => plain },
  { methods: GET, pattern: /^\/sales-preferences$/, decide: () => plain },
  // ── Espacio compartido: pedidos, tareas, notas y cuentas entre núcleos ──────
  // Sin corte de fechas: son datos comunes del equipo. Editar o borrar un apunte de las cuentas
  // solo puede su creador o el maestro (lo comprueba el servicio). Los nombres de los núcleos
  // (PUT /ledger/settings) quedan solo para el maestro: no está en esta lista.
  { methods: ["GET", "POST"], pattern: /^\/notes$/, decide: () => plain },
  { methods: ["PATCH", "DELETE"], pattern: new RegExp(`^/notes/${UUID}$`), decide: () => plain },
  { methods: ["GET", "POST"], pattern: /^\/tasks$/, decide: () => plain },
  { methods: ["PATCH", "DELETE"], pattern: new RegExp(`^/tasks/${UUID}$`), decide: () => plain },
  { methods: ["POST"], pattern: new RegExp(`^/tasks/${UUID}/(?:done|reopen)$`), decide: () => plain },
  { methods: ["GET", "POST"], pattern: /^\/orders$/, decide: () => plain },
  { methods: ["GET", "PATCH"], pattern: new RegExp(`^/orders/${UUID}$`), decide: () => plain },
  { methods: ["POST"], pattern: new RegExp(`^/orders/${UUID}/(?:cancel|lines)$`), decide: () => plain },
  { methods: ["DELETE"], pattern: new RegExp(`^/orders/${UUID}/lines/${UUID}$`), decide: () => plain },
  { methods: ["POST"], pattern: new RegExp(`^/orders/${UUID}/lines/${UUID}/progress$`), decide: () => plain },
  { methods: GET, pattern: /^\/ledger\/(?:summary|entries|settings)$/, decide: () => plain },
  { methods: ["POST"], pattern: /^\/ledger\/(?:entries|settle)$/, decide: () => plain },
  { methods: ["PATCH", "DELETE"], pattern: new RegExp(`^/ledger/entries/${UUID}$`), decide: () => plain },
];

export function evaluatePartnerRequest(
  method: string,
  pathname: string,
  query: URLSearchParams,
  context: Context,
): PartnerDecision {
  const verb = method.toUpperCase();
  for (const rule of rules) {
    if (!rule.methods.includes(verb)) continue;
    const match = pathname.match(rule.pattern);
    if (match) return rule.decide(match, query, context);
  }
  return deny;
}

/** Documento utilizable por un socio: fecha dentro del periodo visible. */
export function visibleDocument(issueDate: string | undefined, historyFrom: string): boolean {
  return isIsoDate(issueDate) && issueDate >= historyFrom;
}
