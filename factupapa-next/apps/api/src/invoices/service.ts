import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { recordAudit } from "../database/audit.js";
import { withTenantTransaction } from "../database/client.js";
import { HttpError } from "../http/errors.js";
import { lineAmounts, sumAmounts } from "../sales/money.js";
import { InvoiceRepository } from "./repository.js";
import type { InvoiceCreate, InvoiceLineInput, InvoicePatch } from "./types.js";

/** Facturas en borrador y emitidas siguen abiertas durante su ciclo operativo. */
export function isInvoiceEditableStatus(status: string): boolean {
  return status === "draft" || status === "issued";
}

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
    const payment = await client.query<
      { status: string; paidTotal: string } & QueryResultRow
    >(
      `select status,coalesce((select sum(amount) from payments where invoice_id=invoices.id),0)::text "paidTotal"
       from invoices where id=$1`,
      [id],
    );
    if (
      payment.rows[0]?.status === "issued" &&
      Number(t.total) + 0.005 < Number(payment.rows[0].paidTotal)
    )
      throw new HttpError("invoice_total_below_paid", 409);
    await client.query(
      `update invoices set subtotal=$2,tax_total=$3,total=$4 where id=$1`,
      [id, t.subtotal, t.taxTotal, t.total],
    );
  }

  private async assertNumberAvailable(
    client: PoolClient,
    companyId: string,
    series: string,
    number: number,
    exceptId?: string,
  ) {
    const duplicate = await client.query<{ id: string } & QueryResultRow>(
      `select id from invoices
       where company_id=$1 and direction='sale' and series=$2 and number=$3
         and ($4::uuid is null or id<>$4::uuid)
       limit 1`,
      [companyId, series, number, exceptId ?? null],
    );
    if (duplicate.rowCount) throw new HttpError("invoice_number_conflict", 409);
  }

  async numberPreview(
    identity: SessionIdentity,
    input: { series: string; issueDate: string },
  ) {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const sequence = await client.query<{ nextNumber: number } & QueryResultRow>(
        `select next_number "nextNumber" from document_sequences
         where company_id=$1 and document_type='invoice' and series=$2`,
        [identity.companyId, input.series],
      );
      if (sequence.rows[0])
        return { series: input.series, number: Number(sequence.rows[0].nextNumber) };

      const preferences = await client.query<
        {
          numberingMode: "test" | "live";
          invoicePrefix: string;
          invoiceStartNumber: number;
        } & QueryResultRow
      >(
        `select numbering_mode "numberingMode",invoice_prefix "invoicePrefix",invoice_start_number "invoiceStartNumber"
         from company_sales_preferences where company_id=$1`,
        [identity.companyId],
      );
      const pref = preferences.rows[0];
      const liveSeries = pref
        ? `${pref.invoicePrefix}_${input.issueDate.slice(0, 4)}`
        : "";
      const number =
        pref?.numberingMode === "live" && input.series === liveSeries
          ? Number(pref.invoiceStartNumber)
          : /^[A-Z0-9_-]{1,12}_[0-9]{4}$/.test(input.series)
            ? 100
            : 1;
      return { series: input.series, number };
    });
  }

  private async advanceReservedNumber(client: PoolClient, companyId: string, series: string, number: number) {
    await client.query(
      `insert into document_sequences(company_id,document_type,series,next_number)
       values($1,'invoice',$2,$3)
       on conflict(company_id,document_type,series)
       do update set next_number=greatest(document_sequences.next_number,excluded.next_number)`,
      [companyId, series, number + 1],
    );
  }

  async create(identity: SessionIdentity, input: InvoiceCreate) {
    return withTenantTransaction(this.pool, identity, async (c) => {
      if (input.number != null)
        await this.assertNumberAvailable(
          c,
          identity.companyId,
          input.series,
          input.number,
        );
      const invoice = await this.repository.create(
        c,
        identity.companyId,
        identity.userId,
        input,
      );
      if (!invoice) throw new HttpError("not_found", 404);
      if (input.number != null)
        await this.advanceReservedNumber(c, identity.companyId, input.series, input.number);
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
      if (!isInvoiceEditableStatus(before.status)) throw new HttpError("conflict", 409);
      if (
        before.status === "issued" &&
        input.number !== undefined &&
        input.number !== before.number
      )
        throw new HttpError("conflict", 409);

      const targetSeries = input.series ?? before.series;
      const targetNumber = input.number === undefined ? before.number : input.number;
      if (targetNumber != null && (input.number !== undefined || input.series !== undefined))
        await this.advanceReservedNumber(c, identity.companyId, targetSeries, targetNumber);
      if (targetNumber != null && (input.number !== undefined || input.series !== undefined))
        await this.assertNumberAvailable(
          c,
          identity.companyId,
          targetSeries,
          targetNumber,
          id,
        );

      const map = {
        contactId: "contact_id",
        series: "series",
        number: "number",
        issueDate: "issue_date",
        dueDate: "due_date",
        notes: "notes",
        operationStartDate: "operation_start_date",
        operationEndDate: "operation_end_date",
        deliveryDates: "delivery_dates",
        paymentTerms: "payment_terms",
        generalInformation: "general_information",
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
      if (!isInvoiceEditableStatus(inv.status)) throw new HttpError("conflict", 409);
      let description = input.description,
        unit = input.unit,
        price = input.unitPrice,
        rate = input.taxRate,
        productId = input.productId ?? null,
        packageKind: string | null = null,
        packageLabel: string | null = null,
        unitsPerPackage: string | null = null;
      if (productId) {
        const r = await c.query<
          {
            name: string;
            unit: string;
            salePrice: string;
            taxRate: string;
            effectivePrice: string;
            packageKind: string;
            packageLabel: string | null;
            unitsPerPackage: string | null;
          } & QueryResultRow
        >(
          `select p.name,p.unit,p.sale_price "salePrice",p.tax_rate "taxRate",
             p.package_kind "packageKind",p.package_label "packageLabel",p.units_per_package "unitsPerPackage",
             case when cp.is_active and cp.valid_from<=current_date then cp.price else p.sale_price end "effectivePrice"
           from products p left join contact_product_prices cp on cp.company_id=p.company_id and cp.product_id=p.id and cp.contact_id=$2
           where p.id=$1 and p.is_active`,
          [productId, inv.contactId],
        );
        const p = r.rows[0];
        if (!p) throw new HttpError("not_found", 404);
        description ??= p.name;
        unit ??= p.unit as never;
        price ??= p.effectivePrice;
        rate ??= p.taxRate;
        if (p.packageKind !== "none" && p.unitsPerPackage) {
          packageKind = p.packageKind;
          packageLabel = p.packageLabel;
          unitsPerPackage = p.unitsPerPackage;
        }
      }
      if (!description || !unit || price === undefined || rate === undefined)
        throw new HttpError("invalid_request", 400);
      if (
        inv.status === "issued" &&
        inv.operationStartDate &&
        inv.operationEndDate &&
        (!input.deliveryDate ||
          input.deliveryDate < inv.operationStartDate ||
          input.deliveryDate > inv.operationEndDate)
      )
        throw new HttpError("invalid_request", 400);
      const quantity = input.packageQuantity && unitsPerPackage
          ? String(Number(input.packageQuantity) * Number(unitsPerPackage))
          : input.quantity,
        packageQuantity = packageKind && unitsPerPackage
          ? (input.packageQuantity ?? String(Number(quantity) / Number(unitsPerPackage)))
          : null,
        a = lineAmounts(quantity, price, rate),
        position = input.position ?? inv.lines.length + 1;
      if (lineId) {
        const r = await c.query(
          `update invoice_lines set product_id=$3,description=$4,quantity=$5,unit=$6,unit_price=$7,tax_rate=$8,
             line_subtotal=$9,line_tax=$10,line_total=$11,position=$12,package_kind=$13,package_label=$14,
             package_quantity=$15,units_per_package=$16,delivery_date=$17 where id=$1 and invoice_id=$2`,
          [
            lineId,
            id,
            productId,
            description,
            quantity,
            unit,
            price,
            rate,
            a.subtotal,
            a.tax,
            a.total,
            position,
            packageKind,
            packageLabel,
            packageQuantity,
            unitsPerPackage,
            input.deliveryDate ?? null,
          ],
        );
        if (!r.rowCount) throw new HttpError("not_found", 404);
      } else
        await c.query(
          `insert into invoice_lines(company_id,invoice_id,product_id,description,quantity,unit,unit_price,tax_rate,discount_rate,
             line_subtotal,line_tax,line_total,position,package_kind,package_label,package_quantity,units_per_package,delivery_date)
           values($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            identity.companyId,
            id,
            productId,
            description,
            quantity,
            unit,
            price,
            rate,
            a.subtotal,
            a.tax,
            a.total,
            position,
            packageKind,
            packageLabel,
            packageQuantity,
            unitsPerPackage,
            input.deliveryDate ?? null,
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
      if (!isInvoiceEditableStatus(inv.status)) throw new HttpError("conflict", 409);
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
      const isFortnightly = Boolean(
        before.operationStartDate && before.operationEndDate,
      );
      if (
        isFortnightly &&
        before.lines.some(
          (line) =>
            !line.deliveryDate ||
            line.deliveryDate < before.operationStartDate! ||
            line.deliveryDate > before.operationEndDate!,
        )
      )
        throw new HttpError("invalid_request", 400);
      await c.query(
        "insert into company_sales_preferences(company_id) values($1) on conflict(company_id) do nothing",
        [identity.companyId],
      );
      const numbering = await c.query<
        {
          numberingMode: "test" | "live";
          invoicePrefix: string;
        } & QueryResultRow
      >(
        `select numbering_mode "numberingMode",invoice_prefix "invoicePrefix" from company_sales_preferences where company_id=$1`,
        [identity.companyId],
      );
      if (
        numbering.rows[0]?.numberingMode === "live" &&
        before.series !==
          `${numbering.rows[0].invoicePrefix}_${before.issueDate.slice(0, 4)}`
      )
        throw new HttpError("conflict", 409);

      let number = before.number;
      if (number != null) {
        await this.assertNumberAvailable(
          c,
          identity.companyId,
          before.series,
          number,
          id,
        );
        await c.query(
          `insert into document_sequences(company_id,document_type,series,next_number)
           values($1,'invoice',$2,$3)
           on conflict(company_id,document_type,series)
           do update set next_number=greatest(document_sequences.next_number,excluded.next_number)`,
          [identity.companyId, before.series, number + 1],
        );
      } else {
        const seq = await c.query<{ number: number } & QueryResultRow>(
          `insert into document_sequences(company_id,document_type,series,next_number)
           values($1,'invoice',$2,coalesce((select invoice_start_number + 1
             from company_sales_preferences where company_id=$1
               and $2 = invoice_prefix || '_' || extract(year from $3::date)::int::text),
             case when $2 ~ '^[A-Z0-9_-]{1,12}_[0-9]{4}$' then 101 else 2 end))
           on conflict(company_id,document_type,series) do update set next_number=document_sequences.next_number+1
           returning next_number-1 number`,
          [identity.companyId, before.series, before.issueDate],
        );
        number = seq.rows[0]!.number;
      }
      await c.query(
        `update invoices set number=$2,status='issued',issued_at=now() where id=$1`,
        [id, number],
      );
      await c.query(
        `insert into sales_invoice_export_events(company_id,invoice_id,event_type)
         values($1,$2,'sales_invoice_export_requested')
         on conflict(company_id,invoice_id,event_type) do nothing`,
        [identity.companyId, id],
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
        { id: string; contactId: string; issueDate: string } & QueryResultRow
      >(
        `select id,contact_id "contactId",issue_date::text "issueDate" from delivery_notes where id=any($1::uuid[]) and status='issued' order by issue_date,id for update`,
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
          operationStartDate: notes.rows[0]!.issueDate,
          operationEndDate: notes.rows.at(-1)!.issueDate,
          deliveryDates: [...new Set(notes.rows.map((note) => note.issueDate))],
        },
        "delivery_notes",
      );
      if (!invoice) throw new HttpError("not_found", 404);
      await c.query(
        `insert into invoice_lines(company_id,invoice_id,product_id,description,quantity,unit,unit_price,tax_rate,discount_rate,line_subtotal,line_tax,line_total,position,delivery_date)
         select l.company_id,$1,l.product_id,l.description,l.quantity,l.unit,l.unit_price,l.tax_rate,0,l.line_subtotal,l.line_tax,l.line_total,
           row_number() over(order by l.delivery_note_id,l.position),d.issue_date
         from delivery_note_lines l join delivery_notes d on d.id=l.delivery_note_id
         where l.delivery_note_id=any($2::uuid[])`,
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
