import type { Pool } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { OWNER_ROLE, PARTNER_ROLE } from "../authz/partner-policy.js";
import { recordAudit } from "../database/audit.js";
import { withTenantTransaction } from "../database/client.js";
import { assertAllowedKeys } from "../domain/validation.js";
import { HttpError } from "../http/errors.js";

export interface FridgeLine {
  id: string;
  variety: string;
  productId: string;
  productName: string;
  contactId: string | null;
  contactName: string | null;
  quantity: string;
  bags: string | null;
  note: string | null;
  madeAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface FridgeLineInput {
  variety: string;
  productId: string;
  contactId: string | null;
  quantity: string;
  bags: string | null;
  note: string | null;
  /** true: se apunta en la pizarra «por preparar» y todavía no suma a la nevera. */
  toPrepare: boolean;
}

/** Lo que el servicio necesita de las finanzas: sumar o restar kilos a la nevera de una variedad. */
export interface FridgeAdjuster {
  adjustPotatoFridge(identity: SessionIdentity, input: { productId: string; quantity: string; mode: "add" | "subtract" }): Promise<unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL = /^\d{1,10}(?:\.\d{1,4})?$/;

function decimal(value: unknown): string {
  const text = typeof value === "string" || typeof value === "number" ? String(value).replace(",", ".").trim() : "";
  if (!DECIMAL.test(text) || Number(text) <= 0) throw new HttpError("invalid_request", 400);
  return text;
}
function text(value: unknown, maximum: number, required: boolean): string | null {
  if (value === null || value === undefined || value === "") {
    if (required) throw new HttpError("invalid_request", 400);
    return null;
  }
  if (typeof value !== "string" || value.length > maximum) throw new HttpError("invalid_request", 400);
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    if (required) throw new HttpError("invalid_request", 400);
    return null;
  }
  return cleaned;
}

function parseToPrepare(value: unknown): boolean {
  if (value === undefined || value === false) return false;
  if (value === true) return true;
  throw new HttpError("invalid_request", 400);
}

export function validateFridgeLine(body: Record<string, unknown>): FridgeLineInput {
  assertAllowedKeys(body, ["variety", "productId", "contactId", "quantity", "bags", "note", "toPrepare"]);
  if (typeof body.productId !== "string" || !UUID.test(body.productId)) throw new HttpError("invalid_request", 400);
  if (body.contactId != null && (typeof body.contactId !== "string" || !UUID.test(body.contactId))) throw new HttpError("invalid_request", 400);
  return {
    variety: text(body.variety, 60, true)!,
    productId: body.productId,
    contactId: (body.contactId as string | null | undefined) ?? null,
    quantity: decimal(body.quantity),
    bags: body.bags == null || body.bags === "" ? null : decimal(body.bags),
    note: text(body.note, 300, false),
    toPrepare: parseToPrepare(body.toPrepare),
  };
}

function requireTeam(identity: SessionIdentity): void {
  if (identity.role !== OWNER_ROLE && identity.role !== PARTNER_ROLE) throw new HttpError("forbidden", 403);
}

const select = `select l.id, l.variety, l.product_id "productId", p.name "productName", l.contact_id "contactId",
  c.legal_name "contactName", l.quantity::text quantity, l.bags::text bags, l.note,
  l.made_at "madeAt", l.delivered_at "deliveredAt", l.created_at "createdAt"
  from fridge_lines l join products p on p.id = l.product_id left join contacts c on c.id = l.contact_id`;

/** Bolsas hechas con su tipo y, opcionalmente, su cliente. Maestro y socios; sin costes. */
export class FridgeLinesService {
  constructor(
    private readonly pool: Pool,
    private readonly fridge: FridgeAdjuster,
  ) {}

  /** Pendientes de entregar y las entregadas de los últimos 7 días. */
  async list(identity: SessionIdentity): Promise<{ items: FridgeLine[] }> {
    requireTeam(identity);
    return withTenantTransaction(this.pool, identity, async (client) => {
      const result = await client.query<FridgeLine>(
        `${select} where l.delivered_at is null or l.delivered_at > now() - interval '7 days'
         order by (l.delivered_at is not null), (l.made_at is not null), l.created_at desc, l.id limit 200`,
      );
      return { items: result.rows };
    });
  }

  async create(identity: SessionIdentity, input: FridgeLineInput): Promise<FridgeLine> {
    requireTeam(identity);
    if (input.contactId) {
      await withTenantTransaction(this.pool, identity, async (client) => {
        const found = await client.query("select 1 from contacts where id = $1 and kind = 'customer'", [input.contactId]);
        if (!found.rowCount) throw new HttpError("not_found", 404);
      });
    }
    // Hecha: primero la nevera (comprueba que es una variedad de patata, 404 si no) y suma los kilos.
    // Por preparar: solo se apunta; la nevera se toca cuando se marque como hecha.
    if (!input.toPrepare) {
      await this.fridge.adjustPotatoFridge(identity, { productId: input.productId, quantity: input.quantity, mode: "add" });
    } else {
      await withTenantTransaction(this.pool, identity, async (client) => {
        const found = await client.query("select 1 from products where id = $1 and is_active", [input.productId]);
        if (!found.rowCount) throw new HttpError("not_found", 404);
      });
    }
    return withTenantTransaction(this.pool, identity, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `insert into fridge_lines(company_id, variety, product_id, contact_id, quantity, bags, note, created_by_user_id, made_at)
         values($1,$2,$3,$4,$5,$6,$7,$8, case when $9 then null else now() end) returning id`,
        [identity.companyId, input.variety, input.productId, input.contactId, input.quantity, input.bags, input.note, identity.userId, input.toPrepare],
      );
      const id = inserted.rows[0]!.id;
      await recordAudit(client, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "fridge_line",
        entityId: id,
        action: "fridge_line.create",
        after: input,
      });
      return (await client.query<FridgeLine>(`${select} where l.id = $1`, [id])).rows[0]!;
    });
  }

  /** Hecha: la línea de la pizarra pasa a la nevera (suma sus kilos) y queda pendiente de entrega. */
  async markMade(identity: SessionIdentity, id: string): Promise<FridgeLine> {
    requireTeam(identity);
    const line = await withTenantTransaction(this.pool, identity, async (client) =>
      (await client.query<{ productId: string; quantity: string }>(
        `select product_id "productId", quantity::text quantity from fridge_lines where id = $1 and made_at is null`,
        [id],
      )).rows[0],
    );
    if (!line) throw new HttpError("not_found", 404);
    await this.fridge.adjustPotatoFridge(identity, { productId: line.productId, quantity: line.quantity, mode: "add" });
    return withTenantTransaction(this.pool, identity, async (client) => {
      const updated = await client.query("update fridge_lines set made_at = now() where id = $1 and made_at is null returning id", [id]);
      if (!updated.rowCount) throw new HttpError("not_found", 404);
      await recordAudit(client, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "fridge_line",
        entityId: id,
        action: "fridge_line.made",
      });
      return (await client.query<FridgeLine>(`${select} where l.id = $1`, [id])).rows[0]!;
    });
  }

  /** Entregada: sale de la lista. No toca la nevera (la descuentan las ventas). */
  async deliver(identity: SessionIdentity, id: string): Promise<FridgeLine> {
    requireTeam(identity);
    return withTenantTransaction(this.pool, identity, async (client) => {
      const updated = await client.query(
        "update fridge_lines set delivered_at = now() where id = $1 and delivered_at is null and made_at is not null returning id",
        [id],
      );
      if (!updated.rowCount) throw new HttpError("not_found", 404);
      await recordAudit(client, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "fridge_line",
        entityId: id,
        action: "fridge_line.deliver",
      });
      return (await client.query<FridgeLine>(`${select} where l.id = $1`, [id])).rows[0]!;
    });
  }

  /** Borrar una línea pendiente la deshace: resta esos kilos de la nevera. Una entregada solo se borra. */
  async remove(identity: SessionIdentity, id: string): Promise<void> {
    requireTeam(identity);
    const line = await withTenantTransaction(this.pool, identity, async (client) =>
      (await client.query<{ productId: string; quantity: string; inFridge: boolean }>(
        `select product_id "productId", quantity::text quantity, (made_at is not null and delivered_at is null) "inFridge" from fridge_lines where id = $1`,
        [id],
      )).rows[0],
    );
    if (!line) throw new HttpError("not_found", 404);
    await withTenantTransaction(this.pool, identity, async (client) => {
      await client.query("delete from fridge_lines where id = $1", [id]);
      await recordAudit(client, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "fridge_line",
        entityId: id,
        action: "fridge_line.delete",
      });
    });
    if (line.inFridge) {
      await this.fridge.adjustPotatoFridge(identity, { productId: line.productId, quantity: line.quantity, mode: "subtract" });
    }
  }
}
