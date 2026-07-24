import type { Pool } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { recordAudit } from "../database/audit.js";
import { withTenantTransaction } from "../database/client.js";
import { calculateMargin } from "../domain/money.js";
import { HttpError, isPostgresUniqueViolation } from "../http/errors.js";
import { ProductRepository } from "./repository.js";
import type { ProductCreate, ProductListQuery, ProductPatch, ProductRecord } from "./types.js";

function response(product: ProductRecord) {
  const base = product.estimatedCost == null ? null : Number(product.estimatedCost),
    lossFactor = 1 - Number(product.expectedLossRate) / 100,
    packagingPerUnit = product.packageCost && product.unitsPerPackage
      ? Number(product.packageCost) / Number(product.unitsPerPackage) : 0,
    realUnitCost = base == null ? null : ((base / Math.max(lossFactor,0.0001)) + packagingPerUnit).toFixed(4);
  return { ...product, realUnitCost, margin: calculateMargin(product.salePrice, realUnitCost) };
}

export class ProductService {
  constructor(private readonly pool: Pool, private readonly repository = new ProductRepository()) {}

  async create(identity: SessionIdentity, input: ProductCreate) {
    try {
      return await withTenantTransaction(this.pool, identity, async (client) => {
        const product = await this.repository.create(client, identity.companyId, input);
        await recordAudit(client, {
          companyId: identity.companyId, actorUserId: identity.userId, entityType: "product", entityId: product.id,
          action: "product.created", after: product,
        });
        return response(product);
      });
    } catch (error) {
      if (isPostgresUniqueViolation(error)) throw new HttpError("conflict", 409);
      throw error;
    }
  }

  async get(identity: SessionIdentity, id: string) {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const product = await this.repository.findById(client, id);
      if (!product) throw new HttpError("not_found", 404);
      return response(product);
    });
  }

  async list(identity: SessionIdentity, query: ProductListQuery) {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const result = await this.repository.list(client, query);
      return { items: result.items.map(response), total: result.total, page: query.page, pageSize: query.pageSize };
    });
  }

  async update(identity: SessionIdentity, id: string, input: ProductPatch) {
    try {
      return await withTenantTransaction(this.pool, identity, async (client) => {
        const before = await this.repository.findById(client, id);
        if (!before) throw new HttpError("not_found", 404);
        const product = await this.repository.update(client, id, input);
        if (!product) throw new HttpError("not_found", 404);
        await recordAudit(client, {
          companyId: identity.companyId, actorUserId: identity.userId, entityType: "product", entityId: id,
          action: "product.updated", before, after: product,
        });
        return response(product);
      });
    } catch (error) {
      if (isPostgresUniqueViolation(error)) throw new HttpError("conflict", 409);
      throw error;
    }
  }

  async deactivate(identity: SessionIdentity, id: string): Promise<void> {
    await withTenantTransaction(this.pool, identity, async (client) => {
      const before = await this.repository.findById(client, id);
      if (!before) throw new HttpError("not_found", 404);
      const after = await this.repository.deactivate(client, id);
      await recordAudit(client, {
        companyId: identity.companyId, actorUserId: identity.userId, entityType: "product", entityId: id,
        action: "product.deactivated", before, after,
      });
    });
  }
}
