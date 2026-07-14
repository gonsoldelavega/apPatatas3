import type { PoolClient, QueryResultRow } from "pg";
import type { ImportBatch, ImportBatchDetail, ImportEntityType, ImportRowDraft, ImportSourceFormat, ImportStrategy } from "./types.js";

const batchProjection = `
  id,
  entity_type as "entityType",
  source_format as "sourceFormat",
  status,
  total_rows as "totalRows",
  valid_rows as "validRows",
  invalid_rows as "invalidRows",
  duplicate_rows as "duplicateRows",
  checksum,
  validation_summary as "validationSummary",
  created_at as "createdAt",
  validated_at as "validatedAt",
  completed_at as "completedAt",
  failed_at as "failedAt"`;

interface StoredRow extends QueryResultRow {
  rowNumber: number;
  classification: ImportRowDraft["classification"];
  proposedAction: ImportRowDraft["proposedAction"];
  normalizedData: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

export class ImportRepository {
  async findByChecksum(client: PoolClient, entityType: ImportEntityType, checksum: string): Promise<ImportBatch | null> {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`${entityType}:${checksum}`]);
    const result = await client.query<ImportBatch & QueryResultRow>(
      `select ${batchProjection} from import_batches
       where entity_type = $1 and checksum = $2
       order by created_at desc limit 1`,
      [entityType, checksum],
    );
    return result.rows[0] ?? null;
  }

  async classify(client: PoolClient, entityType: ImportEntityType, rows: ImportRowDraft[]): Promise<void> {
    const candidates = rows.filter((row) => row.classification === "new");
    if (entityType === "contacts") {
      const ids = candidates.map((row) => row.normalizedData.taxId).filter((value): value is string => typeof value === "string");
      const result = await client.query<{ id: string; taxId: string } & QueryResultRow>(
        `select id, upper(btrim(tax_id)) as "taxId" from contacts where upper(btrim(tax_id)) = any($1::text[])`, [ids],
      );
      const existing = new Map(result.rows.map((row) => [row.taxId, row.id]));
      for (const row of candidates) {
        const id = existing.get(row.normalizedData.taxId as string);
        if (id) Object.assign(row, { classification: "possible_update", proposedAction: "update", normalizedData: { ...row.normalizedData, existingId: id }, warnings: [...row.warnings, "existing_tax_id"] });
      }
      return;
    }
    if (entityType === "products") {
      const skus = candidates.map((row) => row.normalizedData.sku).filter((value): value is string => typeof value === "string");
      const result = await client.query<{ id: string; sku: string } & QueryResultRow>(
        `select id, lower(btrim(sku)) as sku from products where lower(btrim(sku)) = any($1::text[])`, [skus.map((sku) => sku.toLowerCase())],
      );
      const existing = new Map(result.rows.map((row) => [row.sku, row.id]));
      for (const row of candidates) {
        const id = existing.get(String(row.normalizedData.sku ?? "").toLowerCase());
        if (id) Object.assign(row, { classification: "possible_update", proposedAction: "update", normalizedData: { ...row.normalizedData, existingId: id }, warnings: [...row.warnings, "existing_sku"] });
      }
      return;
    }
    for (const row of candidates) {
      const result = await client.query<{ contactId: string; productId: string; contactType: string; priceId: string | null } & QueryResultRow>(
        `select contact.id as "contactId", product.id as "productId", contact.kind as "contactType", price.id as "priceId"
         from contacts as contact
         cross join products as product
         left join contact_product_prices as price
           on price.company_id = contact.company_id and price.contact_id = contact.id and price.product_id = product.id
         where upper(btrim(contact.tax_id)) = $1 and lower(btrim(product.sku)) = lower($2)`,
        [row.normalizedData.taxId, row.normalizedData.sku],
      );
      const match = result.rows[0];
      if (!match || result.rows.length !== 1 || match.contactType === "supplier") {
        Object.assign(row, { classification: "conflict", proposedAction: "reject", errors: [!match ? "contact_or_product_not_found" : "contact_not_customer"] });
      } else {
        row.normalizedData = { ...row.normalizedData, contactId: match.contactId, productId: match.productId, ...(match.priceId ? { existingId: match.priceId } : {}) };
        if (match.priceId) Object.assign(row, { classification: "possible_update", proposedAction: "update", warnings: [...row.warnings, "existing_specific_price"] });
      }
    }
  }

  async createBatch(
    client: PoolClient,
    input: { companyId: string; userId: string; entityType: ImportEntityType; sourceFormat: ImportSourceFormat; checksum: string; rows: ImportRowDraft[] },
  ): Promise<ImportBatch> {
    const validRows = input.rows.filter((row) => row.classification === "new" || row.classification === "possible_update").length;
    const duplicateRows = input.rows.filter((row) => row.classification === "duplicate").length;
    const invalidRows = input.rows.length - validRows;
    const summary = {
      totalRows: input.rows.length, validRows, invalidRows, duplicateRows,
      newRows: input.rows.filter((row) => row.classification === "new").length,
      possibleUpdates: input.rows.filter((row) => row.classification === "possible_update").length,
      conflicts: input.rows.filter((row) => row.classification === "conflict").length,
      errors: input.rows.filter((row) => row.classification === "error").length,
    };
    const result = await client.query<ImportBatch & QueryResultRow>(
      `insert into import_batches(
         company_id, created_by_user_id, entity_type, source_format, status, total_rows, valid_rows,
         invalid_rows, duplicate_rows, checksum, validation_summary, validated_at
       ) values ($1, $2, $3, $4, 'validated', $5, $6, $7, $8, $9, $10, now())
       returning ${batchProjection}`,
      [input.companyId, input.userId, input.entityType, input.sourceFormat, input.rows.length, validRows, invalidRows, duplicateRows, input.checksum, summary],
    );
    const batch = result.rows[0]!;
    for (const row of input.rows) {
      await client.query(
        `insert into import_batch_rows(company_id, batch_id, row_number, classification, proposed_action, normalized_data, errors, warnings)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          input.companyId, batch.id, row.rowNumber, row.classification, row.proposedAction, row.normalizedData,
          JSON.stringify(row.errors), JSON.stringify(row.warnings),
        ],
      );
    }
    return batch;
  }

  async list(client: PoolClient, page: number, pageSize: number): Promise<{ items: ImportBatch[]; total: number; page: number; pageSize: number }> {
    const count = await client.query<{ total: number } & QueryResultRow>("select count(*)::int as total from import_batches");
    const result = await client.query<ImportBatch & QueryResultRow>(
      `select ${batchProjection} from import_batches order by created_at desc, id desc limit $1 offset $2`,
      [pageSize, (page - 1) * pageSize],
    );
    return { items: result.rows, total: count.rows[0]?.total ?? 0, page, pageSize };
  }

  async detail(client: PoolClient, id: string, rowLimit: number, lock = false): Promise<ImportBatchDetail | null> {
    const batch = await client.query<ImportBatch & QueryResultRow>(
      `select ${batchProjection} from import_batches where id = $1${lock ? " for update" : ""}`, [id],
    );
    if (!batch.rows[0]) return null;
    const rows = await client.query<StoredRow>(
      `select row_number as "rowNumber", classification, proposed_action as "proposedAction",
              normalized_data as "normalizedData", errors, warnings
       from import_batch_rows where batch_id = $1 order by row_number limit $2`, [id, rowLimit],
    );
    return { ...batch.rows[0], rows: rows.rows };
  }

  async allRows(client: PoolClient, id: string): Promise<ImportRowDraft[]> {
    const rows = await client.query<StoredRow>(
      `select row_number as "rowNumber", classification, proposed_action as "proposedAction",
              normalized_data as "normalizedData", errors, warnings
       from import_batch_rows where batch_id = $1 order by row_number`, [id],
    );
    return rows.rows;
  }

  async markImporting(client: PoolClient, id: string): Promise<void> {
    await client.query("update import_batches set status = 'importing' where id = $1", [id]);
  }

  async apply(client: PoolClient, companyId: string, entityType: ImportEntityType, rows: ImportRowDraft[], strategy: ImportStrategy): Promise<{ created: number; updated: number; skipped: number }> {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const row of rows) {
      if (row.classification !== "new" && row.classification !== "possible_update") continue;
      const data = row.normalizedData;
      if (row.classification === "possible_update" && strategy === "skip_existing") { skipped += 1; continue; }
      if (entityType === "contacts") {
        if (row.classification === "new") {
          await client.query(
            `insert into contacts(company_id, kind, legal_name, trade_name, tax_id, email, phone, address, notes, is_active)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [companyId, data.type, data.legalName, data.tradeName ?? null, data.taxId ?? null, data.email ?? null, data.phone ?? null, data.address ?? {}, data.notes ?? null, data.isActive],
          ); created += 1;
        } else {
          await client.query(
            `update contacts set kind=$2, legal_name=$3, trade_name=$4, tax_id=$5, email=$6, phone=$7, address=$8, notes=$9, is_active=$10 where id=$1`,
            [data.existingId, data.type, data.legalName, data.tradeName ?? null, data.taxId ?? null, data.email ?? null, data.phone ?? null, data.address ?? {}, data.notes ?? null, data.isActive],
          ); updated += 1;
        }
      } else if (entityType === "products") {
        if (row.classification === "new") {
          await client.query(
            `insert into products(company_id, name, description, sku, unit, sale_price, estimated_cost, tax_rate, is_active)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [companyId, data.name, data.description ?? null, data.sku ?? null, data.unit, data.salePrice, data.estimatedCost ?? null, data.taxRate, data.isActive],
          ); created += 1;
        } else {
          await client.query(
            `update products set name=$2, description=$3, sku=$4, unit=$5, sale_price=$6, estimated_cost=$7, tax_rate=$8, is_active=$9 where id=$1`,
            [data.existingId, data.name, data.description ?? null, data.sku ?? null, data.unit, data.salePrice, data.estimatedCost ?? null, data.taxRate, data.isActive],
          ); updated += 1;
        }
      } else {
        await client.query(
          `insert into contact_product_prices(company_id, contact_id, product_id, price, valid_from, is_active)
           values ($1,$2,$3,$4,coalesce($5::date,current_date),$6)
           on conflict (company_id, contact_id, product_id) do update
             set price=excluded.price, valid_from=excluded.valid_from, is_active=excluded.is_active`,
          [companyId, data.contactId, data.productId, data.price, data.validFrom ?? null, data.isActive],
        );
        if (row.classification === "new") created += 1; else updated += 1;
      }
    }
    return { created, updated, skipped };
  }

  async complete(client: PoolClient, id: string, result: Record<string, number>): Promise<void> {
    await client.query(
      `update import_batches set status='completed', completed_at=now(), validation_summary=validation_summary || $2::jsonb where id=$1`, [id, result],
    );
  }

  async cancel(client: PoolClient, id: string): Promise<boolean> {
    const result = await client.query(
      `update import_batches set status='cancelled' where id=$1 and status in ('pending','validated') returning id`, [id],
    );
    return result.rowCount === 1;
  }

  async fail(client: PoolClient, id: string): Promise<boolean> {
    const result = await client.query(
      `update import_batches set status='failed', failed_at=now(), validation_summary=validation_summary || '{"failure":"transaction_rolled_back"}'::jsonb
       where id=$1 and status in ('validated','importing') returning id`, [id],
    );
    return result.rowCount === 1;
  }
}
