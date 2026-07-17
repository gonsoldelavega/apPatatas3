import type { PoolClient, QueryResultRow } from "pg";
import type { Invoice, InvoiceCreate, InvoiceLine } from "./types.js";

const projection = `id, contact_id "contactId", number, series, issue_date::text "issueDate",
  due_date::text "dueDate", status, notes, subtotal, tax_total "taxTotal", total,
  operation_start_date::text "operationStartDate",operation_end_date::text "operationEndDate",delivery_dates::text[] "deliveryDates",payment_terms "paymentTerms",general_information "generalInformation",
  source_type "sourceType", contact_legal_name "contactLegalName", contact_tax_id "contactTaxId",
  (select email from contacts c where c.id = invoices.contact_id) "contactEmail",
  contact_address "contactAddress", issuer_legal_name "issuerLegalName", issuer_tax_id "issuerTaxId",
  issuer_address "issuerAddress", issued_at "issuedAt", cancelled_at "cancelledAt",
  created_at "createdAt", updated_at "updatedAt"`;
const lineProjection = `id, product_id "productId", description, quantity, unit,
  unit_price "unitPrice", tax_rate "taxRate", line_subtotal "lineSubtotal",
  line_tax "lineTax", line_total "lineTotal", position`;

export class InvoiceRepository {
  async get(
    client: PoolClient,
    id: string,
    lock = false,
  ): Promise<Invoice | null> {
    const result = await client.query<Invoice & QueryResultRow>(
      `select ${projection} from invoices where id = $1${lock ? " for update" : ""}`,
      [id],
    );
    if (!result.rows[0]) return null;
    const lines = await client.query<InvoiceLine & QueryResultRow>(
      `select ${lineProjection} from invoice_lines where invoice_id = $1 order by position, id`,
      [id],
    );
    const notes = await client.query<{ id: string } & QueryResultRow>(
      `select delivery_note_id id from invoice_delivery_notes where invoice_id = $1 order by created_at, id`,
      [id],
    );
    return {
      ...result.rows[0],
      lines: lines.rows,
      deliveryNoteIds: notes.rows.map((row) => row.id),
    };
  }

  async create(
    client: PoolClient,
    companyId: string,
    userId: string,
    input: InvoiceCreate,
    source: "manual" | "delivery_notes" = "manual",
  ) {
    const contact = await client.query<
      {
        legalName: string;
        taxId: string | null;
        address: Record<string, string>;
        paymentTermsDays: number;
        paymentTermsText: string | null;
        defaultInvoiceInformation: string | null;
        applyInvoiceDefaults: boolean;
      } & QueryResultRow
    >(
      `select legal_name "legalName",tax_id "taxId",address,payment_terms_days "paymentTermsDays",payment_terms_text "paymentTermsText",default_invoice_information "defaultInvoiceInformation",apply_invoice_defaults "applyInvoiceDefaults" from contacts
       where id = $1 and is_active and kind in ('customer', 'both')`,
      [input.contactId],
    );
    const snapshot = contact.rows[0];
    if (!snapshot) return null;
    const issuerResult = await client.query<
      {
        legalName: string;
        taxId: string | null;
        address: Record<string, string>;
      } & QueryResultRow
    >(
      `select name "legalName", tax_id "taxId", address from companies where id = $1`,
      [companyId],
    );
    const issuer = issuerResult.rows[0];
    if (!issuer) return null;
    const result = await client.query<{ id: string } & QueryResultRow>(
      `insert into invoices(company_id,contact_id,direction,series,number,issue_date,due_date,operation_start_date,operation_end_date,delivery_dates,payment_terms,general_information,
         status, notes, source, source_type, created_by_user_id, contact_legal_name, contact_tax_id, contact_address,
         issuer_legal_name, issuer_tax_id, issuer_address)
       values($1,$2,'sale',$3,null,$4,coalesce($5,case when $14::boolean then $4::date + $15::integer else null end),$6,$7,$8,coalesce($9,case when $14::boolean then $16::text else null end),coalesce($10,case when $14::boolean then $17::text else null end),'draft',$11,'native',$12,$13,$18,$19,$20,$21,$22,$23)
       returning id`,
      [
        companyId,
        input.contactId,
        input.series,
        input.issueDate,
        input.dueDate ?? null,
        input.operationStartDate ?? null,
        input.operationEndDate ?? null,
        input.deliveryDates ?? [],
        input.paymentTerms ?? null,
        input.generalInformation ?? null,
        input.notes ?? null,
        source,
        userId,
        snapshot.applyInvoiceDefaults,
        snapshot.paymentTermsDays,
        snapshot.paymentTermsText,
        snapshot.defaultInvoiceInformation,
        snapshot.legalName,
        snapshot.taxId,
        snapshot.address,
        issuer.legalName,
        issuer.taxId,
        issuer.address,
      ],
    );
    return this.get(client, result.rows[0]!.id);
  }

  async list(client: PoolClient, url: URL) {
    const values: unknown[] = [];
    const conditions = ["direction = 'sale'"];
    for (const [parameter, column] of [
      ["contactId", "contact_id"],
      ["status", "status"],
      ["series", "series"],
      ["sourceType", "source_type"],
    ] as const) {
      const value = url.searchParams.get(parameter);
      if (value) {
        values.push(value);
        conditions.push(`${column} = $${values.length}`);
      }
    }
    for (const [parameter, operator] of [
      ["from", ">="],
      ["to", "<="],
    ] as const) {
      const value = url.searchParams.get(parameter);
      if (value) {
        values.push(value);
        conditions.push(`issue_date ${operator} $${values.length}`);
      }
    }
    const search = url.searchParams.get("search");
    if (search) {
      values.push(`%${search}%`);
      conditions.push(
        `concat_ws(' ', series, number::text, contact_legal_name, contact_tax_id) ilike $${values.length}`,
      );
    }
    const requestedPageSize = Number(url.searchParams.get("pageSize") ?? 25);
    const requestedPage = Number(url.searchParams.get("page") ?? 1);
    const pageSize = Number.isFinite(requestedPageSize)
      ? Math.min(Math.max(Math.trunc(requestedPageSize), 1), 100)
      : 25;
    const page = Number.isFinite(requestedPage)
      ? Math.max(Math.trunc(requestedPage), 1)
      : 1;
    const where = `where ${conditions.join(" and ")}`;
    const count = await client.query<{ total: number } & QueryResultRow>(
      `select count(*)::int total from invoices ${where}`,
      values,
    );
    values.push(pageSize, (page - 1) * pageSize);
    const rows = await client.query<Invoice & QueryResultRow>(
      `select ${projection} from invoices ${where} order by issue_date desc, id desc limit $${values.length - 1} offset $${values.length}`,
      values,
    );
    return {
      items: rows.rows,
      total: count.rows[0]?.total ?? 0,
      page,
      pageSize,
    };
  }
}
