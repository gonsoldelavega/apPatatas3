import type { PoolClient, QueryResultRow } from "pg";
import type {
  Contact,
  ContactCreate,
  ContactListQuery,
  ContactPatch,
} from "./types.js";

const projection = `
  id,
  kind as type,
  legal_name as "legalName",
  trade_name as "tradeName",
  tax_id as "taxId",
  email,
  phone,
  address,
  notes,
  payment_terms_days as "paymentTermsDays",
  payment_terms_text as "paymentTermsText",
  default_invoice_information as "defaultInvoiceInformation",
  apply_invoice_defaults as "applyInvoiceDefaults",
  is_active as "isActive",
  created_at as "createdAt",
  updated_at as "updatedAt"`;

function searchPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

export class ContactRepository {
  async create(
    client: PoolClient,
    companyId: string,
    input: ContactCreate,
  ): Promise<Contact> {
    const result = await client.query<Contact & QueryResultRow>(
      `insert into contacts(company_id, kind, legal_name, trade_name, tax_id, email, phone, address, notes,payment_terms_days,payment_terms_text,default_invoice_information,apply_invoice_defaults)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       returning ${projection}`,
      [
        companyId,
        input.type,
        input.legalName,
        input.tradeName ?? null,
        input.taxId ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.address ?? {},
        input.notes ?? null,
        input.paymentTermsDays ?? 0,
        input.paymentTermsText ?? null,
        input.defaultInvoiceInformation ?? null,
        input.applyInvoiceDefaults ?? false,
      ],
    );
    return result.rows[0]!;
  }

  async findById(client: PoolClient, id: string): Promise<Contact | null> {
    const result = await client.query<Contact & QueryResultRow>(
      `select ${projection} from contacts where id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async list(
    client: PoolClient,
    query: ContactListQuery,
  ): Promise<{ items: Contact[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (query.search) {
      values.push(searchPattern(query.search));
      conditions.push(
        `concat_ws(' ', legal_name, trade_name, tax_id, email, phone) ilike $${values.length} escape '\\'`,
      );
    }
    if (query.type) {
      values.push(query.type);
      conditions.push(`kind = $${values.length}`);
    }
    if (query.isActive !== undefined) {
      values.push(query.isActive);
      conditions.push(`is_active = $${values.length}`);
    }
    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const sortColumns = {
      name: "lower(legal_name)",
      createdAt: "created_at",
      updatedAt: "updated_at",
    } as const;
    const count = await client.query<{ total: number } & QueryResultRow>(
      `select count(*)::int as total from contacts ${where}`,
      values,
    );
    values.push(query.pageSize, (query.page - 1) * query.pageSize);
    const items = await client.query<Contact & QueryResultRow>(
      `select ${projection} from contacts ${where}
       order by ${sortColumns[query.sort as keyof typeof sortColumns]} ${query.order}, id ${query.order}
       limit $${values.length - 1} offset $${values.length}`,
      values,
    );
    return { items: items.rows, total: count.rows[0]?.total ?? 0 };
  }

  async update(
    client: PoolClient,
    id: string,
    input: ContactPatch,
  ): Promise<Contact | null> {
    const columns = {
      type: "kind",
      legalName: "legal_name",
      tradeName: "trade_name",
      taxId: "tax_id",
      email: "email",
      phone: "phone",
      address: "address",
      notes: "notes",
      paymentTermsDays: "payment_terms_days",
      paymentTermsText: "payment_terms_text",
      defaultInvoiceInformation: "default_invoice_information",
      applyInvoiceDefaults: "apply_invoice_defaults",
      isActive: "is_active",
    } as const;
    const entries = Object.entries(input) as [keyof ContactPatch, unknown][];
    const assignments = entries.map(
      ([key], index) => `${columns[key]} = $${index + 2}`,
    );
    const result = await client.query<Contact & QueryResultRow>(
      `update contacts set ${assignments.join(", ")} where id = $1 returning ${projection}`,
      [id, ...entries.map(([, value]) => value)],
    );
    return result.rows[0] ?? null;
  }

  async deactivate(client: PoolClient, id: string): Promise<Contact | null> {
    const result = await client.query<Contact & QueryResultRow>(
      `update contacts set is_active = false where id = $1 returning ${projection}`,
      [id],
    );
    return result.rows[0] ?? null;
  }
}
