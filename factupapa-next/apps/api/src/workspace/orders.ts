import type { Pool, PoolClient } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { withTenantTransaction } from "../database/client.js";
import { assertAllowedKeys } from "../domain/validation.js";
import { HttpError } from "../http/errors.js";
import {
  actorName,
  limitValue,
  optionalDate,
  optionalTextValue,
  optionalUuid,
  positiveDecimal,
  textValue,
  uuidValue,
} from "./common.js";

export type OrderUnit = "kg" | "bolsa" | "unidad";
const UNITS: readonly OrderUnit[] = ["kg", "bolsa", "unidad"];

export interface OrderLine {
  id: string;
  productId: string | null;
  description: string;
  unit: OrderUnit;
  quantityOrdered: string;
  quantityDone: string;
  quantityPending: string;
}

export interface OrderProgressEvent {
  lineId: string;
  description: string;
  unit: OrderUnit;
  delta: string;
  doneAfter: string;
  createdByName: string;
  createdAt: string;
}

export interface DeliveryStop extends Order {
  contactPhone: string | null;
  contactAddress: Record<string, string>;
  people: Array<{ name: string; role: string | null; phone: string | null }>;
}

export interface Order {
  id: string;
  contactId: string;
  contactName: string;
  dueDate: string | null;
  notes: string | null;
  status: "open" | "completed" | "cancelled";
  createdByName: string;
  createdAt: string;
  completedAt: string | null;
  lines: OrderLine[];
  history?: OrderProgressEvent[];
}

/** "50.000" → "50", "12.500" → "12.5" */
export function cleanQuantity(value: string): string {
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
}

/** Milésimas exactas (las cantidades tienen 3 decimales como máximo). */
export function toMilli(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(value.trim());
  if (!match) throw new HttpError("invalid_request", 400);
  const milli = BigInt(match[2]!) * 1000n + BigInt((match[3] ?? "").padEnd(3, "0") || "0");
  return match[1] ? -milli : milli;
}

export function fromMilli(milli: bigint): string {
  const negative = milli < 0n;
  const absolute = negative ? -milli : milli;
  return cleanQuantity(`${negative ? "-" : ""}${absolute / 1000n}.${(absolute % 1000n).toString().padStart(3, "0")}`);
}

const orderSelect = `
  select o.id, o.contact_id "contactId", coalesce(c.trade_name, c.legal_name) "contactName",
    o.due_date::text "dueDate", o.notes, o.status, o.created_by_name "createdByName",
    o.created_at::text "createdAt", o.completed_at::text "completedAt",
    coalesce((
      select json_agg(json_build_object(
        'id', l.id, 'productId', l.product_id, 'description', l.description, 'unit', l.unit,
        'quantityOrdered', l.quantity_ordered::text, 'quantityDone', l.quantity_done::text,
        'quantityPending', (l.quantity_ordered - l.quantity_done)::text
      ) order by l.position, l.created_at)
      from customer_order_lines l where l.company_id = o.company_id and l.order_id = o.id
    ), '[]'::json) lines
  from customer_orders o join contacts c on c.company_id = o.company_id and c.id = o.contact_id`;

function normalizeOrder(row: Order): Order {
  return {
    ...row,
    lines: row.lines.map((line) => ({
      ...line,
      quantityOrdered: cleanQuantity(line.quantityOrdered),
      quantityDone: cleanQuantity(line.quantityDone),
      quantityPending: cleanQuantity(line.quantityPending),
    })),
  };
}

export interface OrderLineInput {
  productId?: string | null | undefined;
  description?: string | undefined;
  unit: OrderUnit;
  quantity: string;
}

export interface OrderCreate {
  contactId: string;
  dueDate?: string | null | undefined;
  notes?: string | null | undefined;
  lines: OrderLineInput[];
}

export function validateOrderLine(raw: unknown): OrderLineInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError("invalid_request", 400);
  const line = raw as Record<string, unknown>;
  assertAllowedKeys(line, ["productId", "description", "unit", "quantity"]);
  if (typeof line.unit !== "string" || !UNITS.includes(line.unit as OrderUnit)) throw new HttpError("invalid_request", 400);
  const productId = optionalUuid(line.productId);
  const description = optionalTextValue(line.description, 200);
  if (!productId && !description) throw new HttpError("invalid_request", 400);
  return {
    productId: productId ?? null,
    description: description ?? undefined,
    unit: line.unit as OrderUnit,
    quantity: positiveDecimal(line.quantity, 9, 3),
  };
}

export function validateOrderCreate(body: Record<string, unknown>): OrderCreate {
  assertAllowedKeys(body, ["contactId", "dueDate", "notes", "lines"]);
  if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 50) throw new HttpError("invalid_request", 400);
  return {
    contactId: uuidValue(body.contactId),
    dueDate: optionalDate(body.dueDate),
    notes: optionalTextValue(body.notes, 4000),
    lines: body.lines.map(validateOrderLine),
  };
}

export function validateOrderPatch(body: Record<string, unknown>): { dueDate?: string | null; notes?: string | null } {
  assertAllowedKeys(body, ["dueDate", "notes"], true);
  const result: { dueDate?: string | null; notes?: string | null } = {};
  const dueDate = optionalDate(body.dueDate);
  if (dueDate !== undefined) result.dueDate = dueDate;
  const notes = optionalTextValue(body.notes, 4000);
  if (notes !== undefined) result.notes = notes;
  return result;
}

export type ProgressInput = { delta: string } | { done: string };

/** `delta` suma o resta (corrección); `done` fija el total hecho. Exactamente uno de los dos. */
export function validateProgress(body: Record<string, unknown>): ProgressInput {
  assertAllowedKeys(body, ["delta", "done"], true);
  if ((body.delta === undefined) === (body.done === undefined)) throw new HttpError("invalid_request", 400);
  const read = (value: unknown, allowNegative: boolean): string => {
    const text = (typeof value === "number" ? String(value) : value) as unknown;
    if (typeof text !== "string") throw new HttpError("invalid_request", 400);
    const normalized = text.trim().replace(",", ".");
    if (!(allowNegative ? /^-?\d{1,9}(\.\d{1,3})?$/ : /^\d{1,9}(\.\d{1,3})?$/).test(normalized)) throw new HttpError("invalid_request", 400);
    return normalized;
  };
  return body.delta !== undefined ? { delta: read(body.delta, true) } : { done: read(body.done, false) };
}

export class OrdersService {
  constructor(private readonly pool: Pool) {}

  async list(identity: SessionIdentity, url: URL): Promise<{ items: Order[] }> {
    const status = url.searchParams.get("status") ?? "open";
    if (!["open", "completed", "cancelled", "all"].includes(status)) throw new HttpError("invalid_request", 400);
    const where: string[] = [];
    const values: unknown[] = [];
    if (status !== "all") {
      values.push(status);
      where.push(`o.status = $${values.length}`);
    }
    const contactId = url.searchParams.get("contactId");
    if (contactId) {
      values.push(uuidValue(contactId));
      where.push(`o.contact_id = $${values.length}`);
    }
    values.push(limitValue(url, 100, 300));
    return withTenantTransaction(this.pool, identity, async (client) => ({
      items: (
        await client.query<Order>(
          `${orderSelect} ${where.length ? `where ${where.join(" and ")}` : ""}
           order by o.due_date nulls last, o.created_at desc limit $${values.length}`,
          values,
        )
      ).rows.map(normalizeOrder),
    }));
  }

  /**
   * Reparto del día: pedidos abiertos que tocan entregar hasta `date` (los de hoy y los atrasados),
   * con teléfono, dirección y personas de contacto de cada cliente.
   */
  async deliveryDay(identity: SessionIdentity, date: string): Promise<{ date: string; items: DeliveryStop[] }> {
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) throw new HttpError("invalid_request", 400);
    return withTenantTransaction(this.pool, identity, async (client) => {
      const orders = (
        await client.query<Order>(
          `${orderSelect} where o.status = 'open' and o.due_date is not null and o.due_date <= $1::date
           order by o.due_date, coalesce(c.trade_name, c.legal_name), o.created_at limit 100`,
          [date],
        )
      ).rows.map(normalizeOrder);
      const ids = [...new Set(orders.map((order) => order.contactId))];
      const contacts = ids.length
        ? (
            await client.query<{ id: string; phone: string | null; address: Record<string, string> | null }>(
              "select id, phone, address from contacts where id = any($1::uuid[])",
              [ids],
            )
          ).rows
        : [];
      const people = ids.length
        ? (
            await client.query<{ contactId: string; name: string; role: string | null; phone: string | null }>(
              `select contact_id "contactId", name, role, phone from contact_people
               where contact_id = any($1::uuid[]) order by position, created_at`,
              [ids],
            )
          ).rows
        : [];
      return {
        date,
        items: orders.map((order) => {
          const contact = contacts.find((candidate) => candidate.id === order.contactId);
          return {
            ...order,
            contactPhone: contact?.phone ?? null,
            contactAddress: contact?.address ?? {},
            people: people.filter((person) => person.contactId === order.contactId).map(({ name, role, phone }) => ({ name, role, phone })),
          };
        }),
      };
    });
  }

  async get(identity: SessionIdentity, id: string): Promise<Order> {
    return withTenantTransaction(this.pool, identity, (client) => this.load(client, id, true));
  }

  async create(identity: SessionIdentity, input: OrderCreate): Promise<Order> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const contact = await client.query("select 1 from contacts where id = $1", [input.contactId]);
      if (!contact.rowCount) throw new HttpError("not_found", 404);
      const created = await client.query<{ id: string }>(
        `insert into customer_orders (company_id, contact_id, due_date, notes, created_by_user_id, created_by_name)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [identity.companyId, input.contactId, input.dueDate ?? null, input.notes ?? null, identity.userId, actorName(identity)],
      );
      const orderId = created.rows[0]!.id;
      let position = 1;
      for (const line of input.lines) {
        await this.insertLine(client, identity, orderId, line, position++);
      }
      return this.load(client, orderId, true);
    });
  }

  async update(identity: SessionIdentity, id: string, patch: { dueDate?: string | null; notes?: string | null }): Promise<Order> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      await this.requireOpen(client, id);
      const sets: string[] = [];
      const values: unknown[] = [id];
      if (patch.dueDate !== undefined) {
        values.push(patch.dueDate);
        sets.push(`due_date = $${values.length}`);
      }
      if (patch.notes !== undefined) {
        values.push(patch.notes);
        sets.push(`notes = $${values.length}`);
      }
      await client.query(`update customer_orders set ${sets.join(", ")} where id = $1`, values);
      return this.load(client, id, true);
    });
  }

  async addLine(identity: SessionIdentity, orderId: string, line: OrderLineInput): Promise<Order> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      await this.requireOpen(client, orderId);
      const next = await client.query<{ position: number }>(
        "select coalesce(max(position), 0) + 1 as position from customer_order_lines where order_id = $1",
        [orderId],
      );
      await this.insertLine(client, identity, orderId, line, next.rows[0]!.position);
      return this.load(client, orderId, true);
    });
  }

  async removeLine(identity: SessionIdentity, orderId: string, lineId: string): Promise<Order> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      await this.requireOpen(client, orderId);
      const line = (
        await client.query<{ quantity_done: string }>(
          "select quantity_done::text from customer_order_lines where id = $1 and order_id = $2 for update",
          [lineId, orderId],
        )
      ).rows[0];
      if (!line) throw new HttpError("not_found", 404);
      const count = await client.query<{ n: number }>("select count(*)::int n from customer_order_lines where order_id = $1", [orderId]);
      // No se borra una línea con avance ni la última línea del pedido.
      if (toMilli(line.quantity_done) !== 0n || count.rows[0]!.n <= 1) throw new HttpError("conflict", 409);
      await client.query("delete from customer_order_lines where id = $1", [lineId]);
      await this.refreshStatus(client, orderId);
      return this.load(client, orderId, true);
    });
  }

  /** Anota avance de una línea ("se han hecho 38 bolsas"). El pedido se completa solo cuando todo está hecho. */
  async progress(identity: SessionIdentity, orderId: string, lineId: string, input: ProgressInput): Promise<Order> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const order = (await client.query<{ status: string }>("select status from customer_orders where id = $1 for update", [orderId])).rows[0];
      if (!order) throw new HttpError("not_found", 404);
      if (order.status === "cancelled") throw new HttpError("conflict", 409);
      const line = (
        await client.query<{ ordered: string; done: string }>(
          `select quantity_ordered::text ordered, quantity_done::text done
             from customer_order_lines where id = $1 and order_id = $2 for update`,
          [lineId, orderId],
        )
      ).rows[0];
      if (!line) throw new HttpError("not_found", 404);
      const ordered = toMilli(line.ordered);
      const current = toMilli(line.done);
      const target = "delta" in input ? current + toMilli(input.delta) : toMilli(input.done);
      if (target < 0n || target > ordered) throw new HttpError("invalid_request", 400);
      if (target !== current) {
        await client.query("update customer_order_lines set quantity_done = $2::numeric where id = $1", [lineId, fromMilli(target)]);
        await client.query(
          `insert into customer_order_progress (company_id, order_line_id, delta, done_after, created_by_user_id, created_by_name)
           values ($1, $2, $3::numeric, $4::numeric, $5, $6)`,
          [identity.companyId, lineId, fromMilli(target - current), fromMilli(target), identity.userId, actorName(identity)],
        );
        await this.refreshStatus(client, orderId);
      }
      return this.load(client, orderId, true);
    });
  }

  async cancel(identity: SessionIdentity, id: string): Promise<Order> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      await this.requireOpen(client, id);
      await client.query("update customer_orders set status = 'cancelled', cancelled_at = now() where id = $1", [id]);
      return this.load(client, id, true);
    });
  }

  private async insertLine(client: PoolClient, identity: SessionIdentity, orderId: string, line: OrderLineInput, position: number): Promise<void> {
    let description = line.description;
    if (line.productId) {
      const product = (await client.query<{ name: string }>("select name from products where id = $1", [line.productId])).rows[0];
      if (!product) throw new HttpError("not_found", 404);
      description = description ?? product.name;
    }
    await client.query(
      `insert into customer_order_lines (company_id, order_id, position, product_id, description, unit, quantity_ordered)
       values ($1, $2, $3, $4, $5, $6, $7::numeric)`,
      [identity.companyId, orderId, position, line.productId ?? null, (description as string).slice(0, 200), line.unit, line.quantity],
    );
  }

  private async requireOpen(client: PoolClient, id: string): Promise<void> {
    const row = (await client.query<{ status: string }>("select status from customer_orders where id = $1 for update", [id])).rows[0];
    if (!row) throw new HttpError("not_found", 404);
    if (row.status !== "open") throw new HttpError("conflict", 409);
  }

  private async refreshStatus(client: PoolClient, orderId: string): Promise<void> {
    const pending = await client.query<{ n: number }>(
      "select count(*)::int n from customer_order_lines where order_id = $1 and quantity_done < quantity_ordered",
      [orderId],
    );
    if (pending.rows[0]!.n === 0) {
      await client.query("update customer_orders set status = 'completed', completed_at = now() where id = $1 and status = 'open'", [orderId]);
    } else {
      await client.query("update customer_orders set status = 'open', completed_at = null where id = $1 and status = 'completed'", [orderId]);
    }
  }

  private async load(client: PoolClient, id: string, withHistory: boolean): Promise<Order> {
    const row = (await client.query<Order>(`${orderSelect} where o.id = $1`, [id])).rows[0];
    if (!row) throw new HttpError("not_found", 404);
    const order = normalizeOrder(row);
    if (withHistory) {
      const history = await client.query<OrderProgressEvent>(
        `select p.order_line_id "lineId", l.description, l.unit, p.delta::text delta, p.done_after::text "doneAfter",
                p.created_by_name "createdByName", p.created_at::text "createdAt"
           from customer_order_progress p
           join customer_order_lines l on l.company_id = p.company_id and l.id = p.order_line_id
          where l.order_id = $1 order by p.created_at desc, p.id desc limit 100`,
        [id],
      );
      order.history = history.rows.map((event) => ({ ...event, delta: cleanQuantity(event.delta), doneAfter: cleanQuantity(event.doneAfter) }));
    }
    return order;
  }
}
