import type { PoolClient, QueryResultRow } from "pg";
import type { ProductCreate, ProductListQuery, ProductPatch, ProductRecord } from "./types.js";

export const productProjection = `
  id,
  name,
  description,
  sku,
  unit,
  sale_price as "salePrice",
  estimated_cost as "estimatedCost",
  package_kind as "packageKind",
  package_label as "packageLabel",
  units_per_package as "unitsPerPackage",
  package_cost as "packageCost",
  expected_loss_rate as "expectedLossRate",
  tax_rate as "taxRate",
  is_active as "isActive",
  created_at as "createdAt",
  updated_at as "updatedAt"`;

function searchPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

export class ProductRepository {
  async create(client: PoolClient, companyId: string, input: ProductCreate): Promise<ProductRecord> {
    const result = await client.query<ProductRecord & QueryResultRow>(
      `insert into products(company_id, name, description, sku, unit, sale_price, estimated_cost, tax_rate,
         package_kind,package_label,units_per_package,package_cost,expected_loss_rate)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       returning ${productProjection}`,
      [companyId, input.name, input.description ?? null, input.sku ?? null, input.unit, input.salePrice,
        input.estimatedCost ?? null, input.taxRate, input.packageKind ?? "none", input.packageLabel ?? null,
        input.unitsPerPackage ?? null, input.packageCost ?? null, input.expectedLossRate ?? "0"],
    );
    return result.rows[0]!;
  }

  async findById(client: PoolClient, id: string): Promise<ProductRecord | null> {
    const result = await client.query<ProductRecord & QueryResultRow>(`select ${productProjection} from products where id = $1`, [id]);
    return result.rows[0] ?? null;
  }

  async list(client: PoolClient, query: ProductListQuery): Promise<{ items: ProductRecord[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (query.search) {
      values.push(searchPattern(query.search));
      conditions.push(`concat_ws(' ', name, description, sku) ilike $${values.length} escape '\\'`);
    }
    if (query.isActive !== undefined) {
      values.push(query.isActive);
      conditions.push(`is_active = $${values.length}`);
    }
    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const sortColumns = { name: "lower(name)", createdAt: "created_at", updatedAt: "updated_at", salePrice: "sale_price" } as const;
    const count = await client.query<{ total: number } & QueryResultRow>(`select count(*)::int as total from products ${where}`, values);
    values.push(query.pageSize, (query.page - 1) * query.pageSize);
    const items = await client.query<ProductRecord & QueryResultRow>(
      `select ${productProjection} from products ${where}
       order by ${sortColumns[query.sort as keyof typeof sortColumns]} ${query.order}, id ${query.order}
       limit $${values.length - 1} offset $${values.length}`,
      values,
    );
    return { items: items.rows, total: count.rows[0]?.total ?? 0 };
  }

  async update(client: PoolClient, id: string, input: ProductPatch): Promise<ProductRecord | null> {
    const columns = {
      name: "name", description: "description", sku: "sku", unit: "unit", salePrice: "sale_price",
      estimatedCost: "estimated_cost", taxRate: "tax_rate", isActive: "is_active",
      packageKind: "package_kind", packageLabel: "package_label", unitsPerPackage: "units_per_package",
      packageCost: "package_cost", expectedLossRate: "expected_loss_rate",
    } as const;
    const entries = Object.entries(input) as [keyof ProductPatch, unknown][];
    const assignments = entries.map(([key], index) => `${columns[key]} = $${index + 2}`);
    const result = await client.query<ProductRecord & QueryResultRow>(
      `update products set ${assignments.join(", ")} where id = $1 returning ${productProjection}`,
      [id, ...entries.map(([, value]) => value)],
    );
    return result.rows[0] ?? null;
  }

  async deactivate(client: PoolClient, id: string): Promise<ProductRecord | null> {
    const result = await client.query<ProductRecord & QueryResultRow>(
      `update products set is_active = false where id = $1 returning ${productProjection}`,
      [id],
    );
    return result.rows[0] ?? null;
  }
}
