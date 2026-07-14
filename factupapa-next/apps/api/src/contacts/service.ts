import type { Pool } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { recordAudit } from "../database/audit.js";
import { withTenantTransaction } from "../database/client.js";
import { HttpError, isPostgresUniqueViolation } from "../http/errors.js";
import { ContactRepository } from "./repository.js";
import type { ContactCreate, ContactListQuery, ContactPatch } from "./types.js";

export class ContactService {
  constructor(private readonly pool: Pool, private readonly repository = new ContactRepository()) {}

  async create(identity: SessionIdentity, input: ContactCreate) {
    try {
      return await withTenantTransaction(this.pool, identity, async (client) => {
        const contact = await this.repository.create(client, identity.companyId, input);
        await recordAudit(client, {
          companyId: identity.companyId, actorUserId: identity.userId, entityType: "contact", entityId: contact.id,
          action: "contact.created", after: contact,
        });
        return contact;
      });
    } catch (error) {
      if (isPostgresUniqueViolation(error)) throw new HttpError("conflict", 409);
      throw error;
    }
  }

  async get(identity: SessionIdentity, id: string) {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const contact = await this.repository.findById(client, id);
      if (!contact) throw new HttpError("not_found", 404);
      return contact;
    });
  }

  async list(identity: SessionIdentity, query: ContactListQuery) {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const result = await this.repository.list(client, query);
      return { ...result, page: query.page, pageSize: query.pageSize };
    });
  }

  async update(identity: SessionIdentity, id: string, input: ContactPatch) {
    try {
      return await withTenantTransaction(this.pool, identity, async (client) => {
        const before = await this.repository.findById(client, id);
        if (!before) throw new HttpError("not_found", 404);
        const contact = await this.repository.update(client, id, input);
        if (!contact) throw new HttpError("not_found", 404);
        await recordAudit(client, {
          companyId: identity.companyId, actorUserId: identity.userId, entityType: "contact", entityId: id,
          action: "contact.updated", before, after: contact,
        });
        return contact;
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
        companyId: identity.companyId, actorUserId: identity.userId, entityType: "contact", entityId: id,
        action: "contact.deactivated", before, after,
      });
    });
  }
}
