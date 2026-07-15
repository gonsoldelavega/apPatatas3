import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { recordAudit } from "../database/audit.js";
import { withTenantTransaction } from "../database/client.js";
import { HttpError } from "../http/errors.js";
import type { ImportEntityType, ImportMapping, ImportSourceFormat } from "./types.js";
import { normalizeMapping } from "./mapping.js";

const projection = `id, name, entity_type as "entityType", source_format as "sourceFormat",
  mapping, created_at as "createdAt", updated_at as "updatedAt"`;

export class ImportMappingService {
  constructor(private readonly pool: Pool) {}

  async resolve(client: PoolClient, id: string, entityType: ImportEntityType, sourceFormat: ImportSourceFormat, columns: string[]) {
    const result = await client.query<ImportMapping & QueryResultRow>(
      `select ${projection} from import_mappings where id=$1 and deleted_at is null`, [id],
    );
    const item = result.rows[0];
    if (!item) throw new HttpError("not_found", 404);
    if (item.entityType !== entityType || item.sourceFormat !== sourceFormat) throw new HttpError("invalid_mapping", 400);
    return normalizeMapping(entityType, columns, item.mapping);
  }

  async list(identity: SessionIdentity, entityType?: ImportEntityType) {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const result = await client.query<ImportMapping & QueryResultRow>(
        `select ${projection} from import_mappings
         where deleted_at is null and ($1::text is null or entity_type=$1)
         order by name, id`, [entityType ?? null],
      );
      return { items: result.rows };
    });
  }

  async get(identity: SessionIdentity, id: string) {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const result = await client.query<ImportMapping & QueryResultRow>(`select ${projection} from import_mappings where id=$1 and deleted_at is null`, [id]);
      if (!result.rows[0]) throw new HttpError("not_found", 404);
      return result.rows[0];
    });
  }

  async create(identity: SessionIdentity, input: { name: string; entityType: ImportEntityType; sourceFormat: ImportSourceFormat; mapping: Record<string, string> }) {
    const name = input.name.trim();
    if (!name || name.length > 80) throw new HttpError("invalid_request", 400);
    const columns = Object.values(input.mapping);
    const mapping = normalizeMapping(input.entityType, columns, input.mapping);
    return withTenantTransaction(this.pool, identity, async (client) => {
      try {
        const result = await client.query<ImportMapping & QueryResultRow>(
          `insert into import_mappings(company_id,name,entity_type,source_format,mapping,created_by_user_id)
           values($1,$2,$3,$4,$5,$6) returning ${projection}`,
          [identity.companyId, name, input.entityType, input.sourceFormat, mapping, identity.userId],
        );
        const item = result.rows[0]!;
        await recordAudit(client, { companyId: identity.companyId, actorUserId: identity.userId, entityType: "import_mapping", entityId: item.id, action: "import_mapping.created", after: { name, entityType: input.entityType, sourceFormat: input.sourceFormat, mapping } });
        return item;
      } catch (error) {
        if ((error as { code?: string }).code === "23505") throw new HttpError("conflict", 409);
        throw error;
      }
    });
  }

  async update(identity: SessionIdentity, id: string, input: { name?: string; mapping?: Record<string, string> }) {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const current = await client.query<ImportMapping & QueryResultRow>(`select ${projection} from import_mappings where id=$1 and deleted_at is null for update`, [id]);
      const before = current.rows[0];
      if (!before) throw new HttpError("not_found", 404);
      const name = input.name === undefined ? before.name : input.name.trim();
      if (!name || name.length > 80) throw new HttpError("invalid_request", 400);
      const rawMapping = input.mapping ?? before.mapping;
      const mapping = normalizeMapping(before.entityType, Object.values(rawMapping), rawMapping);
      try {
        const result = await client.query<ImportMapping & QueryResultRow>(`update import_mappings set name=$2,mapping=$3 where id=$1 returning ${projection}`, [id, name, mapping]);
        await recordAudit(client, { companyId: identity.companyId, actorUserId: identity.userId, entityType: "import_mapping", entityId: id, action: "import_mapping.updated", before: { name: before.name, mapping: before.mapping }, after: { name, mapping } });
        return result.rows[0]!;
      } catch (error) {
        if ((error as { code?: string }).code === "23505") throw new HttpError("conflict", 409);
        throw error;
      }
    });
  }

  async remove(identity: SessionIdentity, id: string) {
    await withTenantTransaction(this.pool, identity, async (client) => {
      const result = await client.query(`update import_mappings set deleted_at=now() where id=$1 and deleted_at is null returning id`, [id]);
      if (!result.rowCount) throw new HttpError("not_found", 404);
      await recordAudit(client, { companyId: identity.companyId, actorUserId: identity.userId, entityType: "import_mapping", entityId: id, action: "import_mapping.deleted" });
    });
  }
}
