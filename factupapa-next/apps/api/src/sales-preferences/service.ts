import type { Pool, QueryResultRow } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { recordAudit } from "../database/audit.js";
import { withTenantTransaction } from "../database/client.js";
import { HttpError } from "../http/errors.js";

export interface SalesPreferences {
  invoicePrefix: string;
  invoiceStartNumber: number;
  defaultTaxRate: string;
  primarySalesFlow: "adaptive" | "invoices" | "delivery_notes";
}

interface PreferenceRow extends QueryResultRow {
  invoice_prefix: string;
  invoice_start_number: number;
  default_tax_rate: string;
  primary_sales_flow: SalesPreferences["primarySalesFlow"];
}

const mapped = (row: PreferenceRow): SalesPreferences => ({
  invoicePrefix: row.invoice_prefix,
  invoiceStartNumber: row.invoice_start_number,
  defaultTaxRate: row.default_tax_rate,
  primarySalesFlow: row.primary_sales_flow,
});

export class SalesPreferencesService {
  constructor(private readonly pool: Pool) {}

  async get(identity: SessionIdentity): Promise<SalesPreferences> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      await client.query(
        "insert into company_sales_preferences(company_id) values($1) on conflict(company_id) do nothing",
        [identity.companyId],
      );
      const result = await client.query<PreferenceRow>(
        `select invoice_prefix,invoice_start_number,default_tax_rate::text,primary_sales_flow
         from company_sales_preferences where company_id=$1`,
        [identity.companyId],
      );
      return mapped(result.rows[0]!);
    });
  }

  async update(identity: SessionIdentity, input: SalesPreferences): Promise<SalesPreferences> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const yearSeries = `${input.invoicePrefix}_${new Date().getUTCFullYear()}`;
      const used = await client.query(
        `select 1 from invoices where series=$1 and status <> 'draft'
         union all select 1 from document_sequences where document_type='invoice' and series=$1 limit 1`,
        [yearSeries],
      );
      const beforeResult = await client.query<PreferenceRow>(
        `select invoice_prefix,invoice_start_number,default_tax_rate::text,primary_sales_flow
         from company_sales_preferences where company_id=$1`,
        [identity.companyId],
      );
      const before = beforeResult.rows[0] ? mapped(beforeResult.rows[0]) : null;
      if ((used.rowCount ?? 0) > 0 && before && input.invoiceStartNumber !== before.invoiceStartNumber)
        throw new HttpError("conflict", 409);
      const result = await client.query<PreferenceRow>(
        `insert into company_sales_preferences(company_id,invoice_prefix,invoice_start_number,default_tax_rate,primary_sales_flow)
         values($1,$2,$3,$4,$5)
         on conflict(company_id) do update set invoice_prefix=excluded.invoice_prefix,
           invoice_start_number=excluded.invoice_start_number,default_tax_rate=excluded.default_tax_rate,
           primary_sales_flow=excluded.primary_sales_flow
         returning invoice_prefix,invoice_start_number,default_tax_rate::text,primary_sales_flow`,
        [identity.companyId, input.invoicePrefix, input.invoiceStartNumber, input.defaultTaxRate, input.primarySalesFlow],
      );
      const after = mapped(result.rows[0]!);
      await recordAudit(client, { companyId: identity.companyId, actorUserId: identity.userId, entityType: "company_sales_preferences", entityId: identity.companyId, action: "company_sales_preferences.updated", before, after });
      return after;
    });
  }
}
