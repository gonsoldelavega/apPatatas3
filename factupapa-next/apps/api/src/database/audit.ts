import type { PoolClient } from "pg";

export async function recordAudit(
  client: PoolClient,
  input: {
    companyId: string;
    actorUserId: string;
    entityType: string;
    entityId: string;
    action: string;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  await client.query(
    `insert into audit_events(company_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.companyId,
      input.actorUserId,
      input.entityType,
      input.entityId,
      input.action,
      input.before ?? null,
      input.after ?? null,
    ],
  );
}
