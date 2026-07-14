import type { Pool } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { ContactRepository } from "../contacts/repository.js";
import { recordAudit } from "../database/audit.js";
import { withTenantTransaction } from "../database/client.js";
import { calculateMargin } from "../domain/money.js";
import { HttpError } from "../http/errors.js";
import { ProductRepository } from "../products/repository.js";
import { PricingRepository } from "./repository.js";
import type { EffectiveProductQuery, PriceInput } from "./types.js";

export class PricingService {
  constructor(
    private readonly pool: Pool,
    private readonly prices = new PricingRepository(),
    private readonly contacts = new ContactRepository(),
    private readonly products = new ProductRepository(),
  ) {}

  private async requirePair(client: Parameters<ContactRepository["findById"]>[0], contactId: string, productId?: string) {
    const contact = await this.contacts.findById(client, contactId);
    if (!contact) throw new HttpError("not_found", 404);
    if (contact.type === "supplier") throw new HttpError("invalid_request", 400);
    if (productId) {
      const product = await this.products.findById(client, productId);
      if (!product) throw new HttpError("not_found", 404);
    }
  }

  async upsert(identity: SessionIdentity, contactId: string, productId: string, input: PriceInput) {
    return withTenantTransaction(this.pool, identity, async (client) => {
      await this.requirePair(client, contactId, productId);
      const before = await this.prices.find(client, contactId, productId);
      const after = await this.prices.upsert(client, identity.companyId, contactId, productId, input);
      await recordAudit(client, {
        companyId: identity.companyId, actorUserId: identity.userId, entityType: "contact_product_price",
        entityId: after.id, action: before ? "contact_product_price.updated" : "contact_product_price.created", before, after,
      });
      return after;
    });
  }

  async deactivate(identity: SessionIdentity, contactId: string, productId: string): Promise<void> {
    await withTenantTransaction(this.pool, identity, async (client) => {
      await this.requirePair(client, contactId, productId);
      const before = await this.prices.find(client, contactId, productId);
      if (!before) throw new HttpError("not_found", 404);
      const after = await this.prices.deactivate(client, contactId, productId);
      await recordAudit(client, {
        companyId: identity.companyId, actorUserId: identity.userId, entityType: "contact_product_price",
        entityId: before.id, action: "contact_product_price.deactivated", before, after,
      });
    });
  }

  async listEffective(identity: SessionIdentity, contactId: string, query: EffectiveProductQuery) {
    return withTenantTransaction(this.pool, identity, async (client) => {
      await this.requirePair(client, contactId);
      const result = await this.prices.listEffective(client, contactId, query);
      return {
        items: result.items.map(({ estimatedCost, ...product }) => ({
          ...product,
          margin: calculateMargin(product.effectivePrice, estimatedCost),
        })),
        total: result.total,
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }
}
