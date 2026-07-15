import type { PoolClient, QueryResultRow } from "pg";
import type {
  DeliveryLine,
  DeliveryNote,
  DeliveryCreate,
  DeliveryPatch,
} from "./types.js";
const noteProjection = `id, contact_id as "contactId", number, series, issue_date::text as "issueDate", status, notes, subtotal, tax_total as "taxTotal", total, created_at as "createdAt", updated_at as "updatedAt", issued_at as "issuedAt", cancelled_at as "cancelledAt"`;
const lineProjection = `id, product_id as "productId", description, quantity, unit, unit_price as "unitPrice", tax_rate as "taxRate", line_subtotal as "lineSubtotal", line_tax as "lineTax", line_total as "lineTotal", position`;
export class DeliveryNoteRepository {
  async get(
    client: PoolClient,
    id: string,
    lock = false,
  ): Promise<DeliveryNote | null> {
    const note = await client.query<DeliveryNote & QueryResultRow>(
      `select ${noteProjection} from delivery_notes where id=$1${lock ? " for update" : ""}`,
      [id],
    );
    if (!note.rows[0]) return null;
    const lines = await client.query<DeliveryLine & QueryResultRow>(
      `select ${lineProjection} from delivery_note_lines where delivery_note_id=$1 order by position,id`,
      [id],
    );
    return { ...note.rows[0], lines: lines.rows };
  }
  async create(
    client: PoolClient,
    companyId: string,
    userId: string,
    input: DeliveryCreate,
  ) {
    const r = await client.query<{ id: string } & QueryResultRow>(
      `insert into delivery_notes(company_id,contact_id,series,issue_date,notes,created_by_user_id) values($1,$2,$3,$4,$5,$6) returning id`,
      [
        companyId,
        input.contactId,
        input.series,
        input.issueDate,
        input.notes ?? null,
        userId,
      ],
    );
    return this.get(client, r.rows[0]!.id);
  }
  async update(client: PoolClient, id: string, input: DeliveryPatch) {
    const map = {
      contactId: "contact_id",
      series: "series",
      issueDate: "issue_date",
      notes: "notes",
    } as const;
    const entries = Object.entries(input) as [keyof DeliveryPatch, unknown][];
    await client.query(
      `update delivery_notes set ${entries.map(([k], i) => `${map[k]}=$${i + 2}`).join(",")} where id=$1`,
      [id, ...entries.map(([, v]) => v)],
    );
    return this.get(client, id);
  }
  async list(client: PoolClient, url: URL) {
    const values: unknown[] = [];
    const conditions: string[] = [];
    for (const [param, column] of [
      ["contactId", "contact_id"],
      ["status", "status"],
      ["series", "series"],
    ] as const) {
      const value = url.searchParams.get(param);
      if (value) {
        values.push(value);
        conditions.push(`${column}=$${values.length}`);
      }
    }
    const pending = url.searchParams.get("pendingInvoice");
    if (pending === "true") conditions.push("status='issued'");
    const search = url.searchParams.get("search");
    if (search) {
      values.push(`%${search}%`);
      conditions.push(
        `concat_ws(' ',series,number::text,notes) ilike $${values.length}`,
      );
    }
    const from = url.searchParams.get("from");
    if (from) {
      values.push(from);
      conditions.push(`issue_date >= $${values.length}`);
    }
    const to = url.searchParams.get("to");
    if (to) {
      values.push(to);
      conditions.push(`issue_date <= $${values.length}`);
    }
    const requestedPageSize = Number(url.searchParams.get("pageSize") ?? 25);
    const requestedPage = Number(url.searchParams.get("page") ?? 1);
    const pageSize = Number.isFinite(requestedPageSize)
      ? Math.min(Math.max(Math.trunc(requestedPageSize), 1), 100)
      : 25;
    const page = Number.isFinite(requestedPage)
      ? Math.max(Math.trunc(requestedPage), 1)
      : 1;
    values.push(pageSize, (page - 1) * pageSize);
    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const rows = await client.query<DeliveryNote & QueryResultRow>(
      `select ${noteProjection} from delivery_notes ${where} order by issue_date desc,id desc limit $${values.length - 1} offset $${values.length}`,
      values,
    );
    const count = await client.query<{ total: number } & QueryResultRow>(
      `select count(*)::int total from delivery_notes ${where}`,
      values.slice(0, -2),
    );
    return {
      items: rows.rows,
      total: count.rows[0]?.total ?? 0,
      page,
      pageSize,
    };
  }
}
