import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { recordAudit } from "../database/audit.js";
import { withTenantTransaction } from "../database/client.js";
import { HttpError } from "../http/errors.js";
import { lineAmounts, sumAmounts } from "../sales/money.js";
import { InvoiceRepository } from "./repository.js";
import type { InvoiceCreate, InvoiceLineInput, InvoicePatch } from "./types.js";
export class InvoiceService {
  constructor(
    private pool: Pool,
    private repository = new InvoiceRepository(),
  ) {}
  private async totals(client: PoolClient, id: string) {
    const r = await client.query<
      {
        lineSubtotal: string;
        lineTax: string;
        lineTotal: string;
      } & QueryResultRow
    >(
      `select line_subtotal "lineSubtotal",line_tax "lineTax",line_total "lineTotal" from invoice_lines where invoice_id=$1`,
      [id],
    );
    const t = sumAmounts(r.rows);
    await client.query(
      `update invoices set subtotal=$2,tax_total=$3,total=$4 where id=$1`,
      [id, t.subtotal, t.taxTotal, t.total],
    );
  }
  async create(identity: SessionIdentity, input: InvoiceCreate) {
    return withTenantTransaction(this.pool, identity, async (c) => {
      const invoice = await this.repository.create(
        c,
        identity.companyId,
        identity.userId,
        input,
      );
      if (!invoice) throw new HttpError("not_found", 404);
      await recordAudit(c, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "invoice",
        entityId: invoice.id,
        action: "invoice.created",
        after: invoice,
      });
      return invoice;
    });
  }
  async get(identity: SessionIdentity, id: string) {
    return withTenantTransaction(this.pool, identity, async (c) => {
      const x = await this.repository.get(c, id);
      if (!x) throw new HttpError("not_found", 404);
      return x;
    });
  }
  async list(identity: SessionIdentity, url: URL) {
    return withTenantTransaction(this.pool, identity, (c) =>
      this.repository.list(c, url),
    );
  }
  async update(identity: SessionIdentity, id: string, input: InvoicePatch) {
    return withTenantTransaction(this.pool, identity, async (c) => {
      const before = await this.repository.get(c, id, true);
      if (!before) throw new HttpError("not_found", 404);
      if (before.status !== "draft") throw new HttpError("conflict", 409);
      const map = {
        contactId: "contact_id",
        series: "series",
        issueDate: "issue_date",
        dueDate: "due_date",
        notes: "notes",
      } as const;
      const entries = Object.entries(input) as [keyof InvoicePatch, unknown][];
      if (input.contactId) {
        const contact = await c.query<
          {
            legalName: string;
            taxId: string | null;
            address: unknown;
          } & QueryResultRow
        >(
          `select legal_name "legalName",tax_id "taxId",address from contacts where id=$1 and is_active and kind in ('customer','both')`,
          [input.contactId],
        );
        const x = contact.rows[0];
        if (!x) throw new HttpError("not_found", 404);
        await c.query(
          `update invoices set contact_id=$2,contact_legal_name=$3,contact_tax_id=$4,contact_address=$5 where id=$1`,
          [id, input.contactId, x.legalName, x.taxId, x.address],
        );
      }
      const filtered = entries.filter(([k]) => k !== "contactId");
      if (filtered.length)
        await c.query(
          `update invoices set ${filtered.map(([k], i) => `${map[k]}=$${i + 2}`).join(",")} where id=$1`,
          [id, ...filtered.map(([, v]) => v)],
        );
      const after = await this.repository.get(c, id);
      await recordAudit(c, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "invoice",
        entityId: id,
        action: "invoice.updated",
        before,
        after,
      });
      return after;
    });
  }
  async line(
    identity: SessionIdentity,
    id: string,
    lineId: string | undefined,
    input: InvoiceLineInput,
  ) {
    return withTenantTransaction(this.pool, identity, async (c) => {
      const inv = await this.repository.get(c, id, true);
      if (!inv) throw new HttpError("not_found", 404);
      if (inv.status !== "draft") throw new HttpError("conflict", 409);
      let description = input.description,
        unit = input.unit,
        price = input.unitPrice,
        rate = input.taxRate,
        productId = input.productId ?? null;
      if (productId) {
        const r = await c.query<
          {
            name: string;
            unit: string;
            salePrice: string;
            taxRate: string;
            effectivePrice: string;
          } & QueryResultRow
        >(
          `select p.name,p.unit,p.sale_price "salePrice",p.tax_rate "taxRate",case when cp.is_active and cp.valid_from<=current_date then cp.price else p.sale_price end "effectivePrice" from products p left join contact_product_prices cp on cp.company_id=p.company_id and cp.product_id=p.id and cp.contact_id=$2 where p.id=$1 and p.is_active`,
          [productId, inv.contactId],
        );
        const p = r.rows[0];
        if (!p) throw new HttpError("not_found", 404);
        description ??= p.name;
        unit ??= p.unit as never;
        price ??= p.effectivePrice;
        rate ??= p.taxRate;
      }
      if (!description || !unit || price === undefined || rate === undefined)
        throw new HttpError("invalid_request", 400);
      const a = lineAmounts(input.quantity, price, rate),
        position = input.position ?? inv.lines.length + 1;
      if (lineId) {
        const r = await c.query(
          `update invoice_lines set product_id=$3,description=$4,quantity=$5,unit=$6,unit_price=$7,tax_rate=$8,line_subtotal=$9,line_tax=$10,line_total=$11,position=$12 where id=$1 and invoice_id=$2`,
          [
            lineId,
            id,
            productId,
            description,
            input.quantity,
            unit,
            price,
            rate,
            a.subtotal,
            a.tax,
            a.total,
            position,
          ],
        );
        if (!r.rowCount) throw new HttpError("not_found", 404);
      } else
        await c.query(
          `insert into invoice_lines(company_id,invoice_id,product_id,description,quantity,unit,unit_price,tax_rate,discount_rate,line_subtotal,line_tax,line_total,position) values($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11,$12)`,
          [
            identity.companyId,
            id,
            productId,
            description,
            input.quantity,
            unit,
            price,
            rate,
            a.subtotal,
            a.tax,
            a.total,
            position,
          ],
        );
      await this.totals(c, id);
      const after = await this.repository.get(c, id);
      await recordAudit(c, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "invoice",
        entityId: id,
        action: lineId ? "invoice.line_updated" : "invoice.line_created",
        after,
      });
      return after;
    });
  }
  async deleteLine(identity: SessionIdentity, id: string, lineId: string) {
    await withTenantTransaction(this.pool, identity, async (c) => {
      const inv = await this.repository.get(c, id, true);
      if (!inv) throw new HttpError("not_found", 404);
      if (inv.status !== "draft") throw new HttpError("conflict", 409);
      const r = await c.query(
        `delete from invoice_lines where id=$1 and invoice_id=$2`,
        [lineId, id],
      );
      if (!r.rowCount) throw new HttpError("not_found", 404);
      await this.totals(c, id);
      await recordAudit(c, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "invoice",
        entityId: id,
        action: "invoice.line_deleted",
      });
    });
  }
  async issue(identity: SessionIdentity, id: string) {
    return withTenantTransaction(this.pool, identity, async (c) => {
      const before = await this.repository.get(c, id, true);
      if (!before) throw new HttpError("not_found", 404);
      if (before.status !== "draft" || !before.lines.length)
        throw new HttpError("conflict", 409);
      const seq = await c.query<{ number: number } & QueryResultRow>(
        `insert into document_sequences(company_id,document_type,series,next_number) values($1,'invoice',$2,2) on conflict(company_id,document_type,series) do update set next_number=document_sequences.next_number+1 returning next_number-1 number`,
        [identity.companyId, before.series],
      );
      await c.query(
        `update invoices set number=$2,status='issued',issued_at=now() where id=$1`,
        [id, seq.rows[0]!.number],
      );
      const after = await this.repository.get(c, id);
      await recordAudit(c, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "invoice",
        entityId: id,
        action: "invoice.issued",
        before,
        after,
      });
      return after;
    });
  }
  async cancel(identity: SessionIdentity, id: string) {
    return withTenantTransaction(this.pool, identity, async (c) => {
      const before = await this.repository.get(c, id, true);
      if (!before) throw new HttpError("not_found", 404);
      if (before.status !== "issued") throw new HttpError("conflict", 409);
      await c.query(`select public.cancel_sales_invoice($1::uuid)`, [id]);
      const after = await this.repository.get(c, id);
      return after;
    });
  }
  async fromDeliveryNotes(
    identity: SessionIdentity,
    input: {
      deliveryNoteIds: string[];
      series: string;
      issueDate: string;
      dueDate?: string | null;
      notes?: string | null;
    },
  ) {
    return withTenantTransaction(this.pool, identity, async (c) => {
      const notes = await c.query<
        { id: string; contactId: string } & QueryResultRow
      >(
        `select id,contact_id "contactId" from delivery_notes where id=any($1::uuid[]) and status='issued' order by id for update`,
        [input.deliveryNoteIds],
      );
      if (notes.rowCount !== input.deliveryNoteIds.length)
        throw new HttpError("conflict", 409);
      if (new Set(notes.rows.map((n) => n.contactId)).size !== 1)
        throw new HttpError("invalid_request", 400);
      const invoice = await this.repository.create(
        c,
        identity.companyId,
        identity.userId,
        {
          contactId: notes.rows[0]!.contactId,
          series: input.series,
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          notes: input.notes,
        },
        "delivery_notes",
      );
      if (!invoice) throw new HttpError("not_found", 404);
      await c.query(
        `insert into invoice_lines(company_id,invoice_id,product_id,description,quantity,unit,unit_price,tax_rate,discount_rate,line_subtotal,line_tax,line_total,position) select company_id,$1,product_id,description,quantity,unit,unit_price,tax_rate,0,line_subtotal,line_tax,line_total,row_number() over(order by delivery_note_id,position) from delivery_note_lines where delivery_note_id=any($2::uuid[])`,
        [invoice.id, input.deliveryNoteIds],
      );
      for (const noteId of input.deliveryNoteIds)
        await c.query(
          `insert into invoice_delivery_notes(company_id,invoice_id,delivery_note_id) values($1,$2,$3)`,
          [identity.companyId, invoice.id, noteId],
        );
      await c.query(
        `update delivery_notes set status='invoiced' where id=any($1::uuid[])`,
        [input.deliveryNoteIds],
      );
      await this.totals(c, invoice.id);
      const after = await this.repository.get(c, invoice.id);
      await recordAudit(c, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityType: "invoice",
        entityId: invoice.id,
        action: "invoice.created_from_delivery_notes",
        after: { deliveryNoteIds: input.deliveryNoteIds },
      });
      return after;
    });
  }
}
