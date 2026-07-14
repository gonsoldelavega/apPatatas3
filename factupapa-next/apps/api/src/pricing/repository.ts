import type { PoolClient, QueryResultRow } from "pg";
import type { EffectiveProduct, EffectiveProductQuery, ContactProductPrice, PriceInput } from "./types.js";

export interface EffectiveProductRecord extends Omit<EffectiveProduct, "margin"> {
  estimatedCost: string | null;
}

const priceProjection = `
  id,
  contact_id as "contactId",
  product_id as "productId",
  price,
  valid_from::text as "validFrom",
  is_active as "isActive",
  created_at as "createdAt",
  updated_at as "updatedAt"`;

function searchPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

export class PricingRepository {
  async find(client: PoolClient, contactId: string, productId: string): Promise<ContactProductPrice | null> {
    const result = await client.query<ContactProductPrice & QueryResultRow>(
      `select ${priceProjection} from contact_product_prices where contact_id = $1 and product_id = $2`,
      [contactId, productId],
    );
    return result.rows[0] ?? null;
  }

  async upsert(
    client: PoolClient,
    companyId: string,
    contactId: string,
    productId: string,
    input: PriceInput,
  ): Promise<ContactProductPrice> {
    const result = await client.query<ContactProductPrice & QueryResultRow>(
      `insert into contact_product_prices(company_id, contact_id, product_id, price, valid_from, is_active)
       values ($1, $2, $3, $4, coalesce($5::date, current_date), $6)
       on conflict (company_id, contact_id, product_id) do update
       set price = excluded.price, valid_from = excluded.valid_from, is_active = excluded.is_active
       returning ${priceProjection}`,
      [companyId, contactId, productId, input.price, input.validFrom ?? null, input.isActive ?? true],
    );
    return result.rows[0]!;
  }

  async deactivate(client: PoolClient, contactId: string, productId: string): Promise<ContactProductPrice | null> {
    const result = await client.query<ContactProductPrice & QueryResultRow>(
      `update contact_product_prices set is_active = false
       where contact_id = $1 and product_id = $2 returning ${priceProjection}`,
      [contactId, productId],
    );
    return result.rows[0] ?? null;
  }

  async listEffective(
    client: PoolClient,
    contactId: string,
    query: EffectiveProductQuery,
  ): Promise<{ items: EffectiveProductRecord[]; total: number }> {
    const conditions = ["product.is_active = true"];
    const values: unknown[] = [contactId];
    if (query.search) {
      values.push(searchPattern(query.search));
      conditions.push(`concat_ws(' ', product.name, product.description, product.sku) ilike $${values.length} escape '\\'`);
    }
    const where = `where ${conditions.join(" and ")}`;
    const count = await client.query<{ total: number } & QueryResultRow>(
      `select count(*)::int as total
       from products as product
       left join contact_product_prices as price
         on price.company_id = product.company_id and price.product_id = product.id and price.contact_id = $1
       ${where}`,
      values,
    );
    values.push(query.pageSize, (query.page - 1) * query.pageSize);
    const sort = query.sort === "effectivePrice" ? `"effectivePrice"` : "lower(product.name)";
    const items = await client.query<EffectiveProductRecord & QueryResultRow>(
      `select
         product.id,
         product.name,
         product.sku,
         product.unit,
         product.sale_price as "salePrice",
         case when price.is_active and price.valid_from <= current_date then price.price else null end as "specificPrice",
         case when price.is_active and price.valid_from <= current_date then price.price else product.sale_price end as "effectivePrice",
         product.tax_rate as "taxRate",
         product.estimated_cost as "estimatedCost"
       from products as product
       left join contact_product_prices as price
         on price.company_id = product.company_id and price.product_id = product.id and price.contact_id = $1
       ${where}
       order by ${sort} ${query.order}, product.id ${query.order}
       limit $${values.length - 1} offset $${values.length}`,
      values,
    );
    return { items: items.rows, total: count.rows[0]?.total ?? 0 };
  }
}
