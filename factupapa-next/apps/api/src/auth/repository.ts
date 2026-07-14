import { randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { setTenantContext, withTenantTransaction } from "../database/client.js";

export interface UserContext {
  userId: string;
  companyId: string;
  email: string;
  displayName: string;
  passwordHash: string;
  companyName: string;
  role: string;
}

export interface SessionIdentity extends Omit<UserContext, "passwordHash"> {
  familyId: string;
}

interface SessionRow extends QueryResultRow, SessionIdentity {
  sessionId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

interface RefreshTenantRow extends QueryResultRow {
  companyId: string;
  userId: string;
}

interface AuditInput {
  companyId?: string;
  actorUserId?: string;
  entityId: string;
  action: string;
  metadata?: Record<string, unknown>;
}

type RotationResult =
  | { status: "rotated"; identity: SessionIdentity }
  | { status: "invalid" }
  | { status: "reused" };

async function insertAudit(client: Pool | PoolClient, input: AuditInput): Promise<void> {
  await client.query(
    `insert into audit_events(company_id, actor_user_id, entity_type, entity_id, action, after_data)
     values ($1, $2, 'auth', $3, $4, $5)`,
    [input.companyId ?? null, input.actorUserId ?? null, input.entityId, input.action, input.metadata ?? null],
  );
}

export class AuthRepository {
  constructor(private readonly pool: Pool) {}

  async findUserByEmail(email: string): Promise<UserContext | null> {
    const result = await this.pool.query<UserContext & QueryResultRow>(
      `select
         user_id as "userId",
         company_id as "companyId",
         email,
         display_name as "displayName",
         password_hash as "passwordHash",
         company_name as "companyName",
         membership_role as role
       from auth_lookup_user($1)`,
      [email],
    );
    return result.rowCount === 1 ? result.rows[0] ?? null : null;
  }

  async createLoginSession(
    user: UserContext,
    refreshTokenHash: string,
    expiresAt: Date,
  ): Promise<SessionIdentity> {
    const familyId = randomUUID();
    return withTenantTransaction(this.pool, user, async (client) => {
      await client.query(
        `insert into auth_sessions(family_id, company_id, user_id, refresh_token_hash, expires_at)
         values ($1, $2, $3, $4, $5)`,
        [familyId, user.companyId, user.userId, refreshTokenHash, expiresAt],
      );
      await client.query("update users set last_login_at = now(), updated_at = now() where id = $1", [user.userId]);
      await insertAudit(client, {
        companyId: user.companyId,
        actorUserId: user.userId,
        entityId: familyId,
        action: "auth.login_succeeded",
      });
      const { passwordHash: _passwordHash, ...identity } = user;
      return { ...identity, familyId };
    });
  }

  async recordLoginFailure(entityId: string, reason: string, user?: UserContext): Promise<void> {
    if (!user) {
      await this.pool.query("select auth_record_anonymous_login_failure($1, $2)", [entityId, reason]);
      return;
    }
    await withTenantTransaction(this.pool, user, (client) =>
      insertAudit(client, {
        companyId: user.companyId,
        entityId,
        action: "auth.login_failed",
        metadata: { reason },
      }),
    );
  }

  async rotateRefreshToken(
    currentHash: string,
    nextHash: string,
    nextExpiresAt: Date,
  ): Promise<RotationResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const tenantResult = await client.query<RefreshTenantRow>(
        `select company_id as "companyId", user_id as "userId"
         from auth_resolve_refresh_tenant($1)`,
        [currentHash],
      );
      const tenant = tenantResult.rows[0];
      if (!tenant) {
        await client.query("rollback");
        return { status: "invalid" };
      }
      await setTenantContext(client, tenant);
      const result = await client.query<SessionRow>(
        `select
           session.id as "sessionId",
           session.family_id as "familyId",
           session.company_id as "companyId",
           session.user_id as "userId",
           session.refresh_token_hash as "refreshTokenHash",
           session.expires_at as "expiresAt",
           session.revoked_at as "revokedAt",
           user_account.email::text as email,
           user_account.display_name as "displayName",
           company.name as "companyName",
           membership.role
         from auth_sessions as session
         join users as user_account on user_account.id = session.user_id
         join memberships as membership
           on membership.company_id = session.company_id and membership.user_id = session.user_id
         join companies as company on company.id = session.company_id
         where session.refresh_token_hash = $1 and user_account.is_active = true
         for update of session`,
        [currentHash],
      );
      const session = result.rows[0];
      if (!session) {
        await client.query("rollback");
        return { status: "invalid" };
      }
      if (session.revokedAt) {
        await client.query(
          `update auth_sessions
           set revoked_at = coalesce(revoked_at, now()), revocation_reason = coalesce(revocation_reason, 'reuse_detected')
           where family_id = $1 and revoked_at is null`,
          [session.familyId],
        );
        await insertAudit(client, {
          companyId: session.companyId,
          entityId: session.familyId,
          action: "auth.refresh_reuse_detected",
        });
        await client.query("commit");
        return { status: "reused" };
      }

      if (session.expiresAt.getTime() <= Date.now()) {
        await client.query(
          "update auth_sessions set revoked_at = now(), revocation_reason = 'expired' where id = $1",
          [session.sessionId],
        );
        await client.query("commit");
        return { status: "invalid" };
      }

      const nextSessionId = randomUUID();
      await client.query(
        `insert into auth_sessions(id, family_id, company_id, user_id, refresh_token_hash, expires_at)
         values ($1, $2, $3, $4, $5, $6)`,
        [nextSessionId, session.familyId, session.companyId, session.userId, nextHash, nextExpiresAt],
      );
      await client.query(
        `update auth_sessions
         set revoked_at = now(), revocation_reason = 'rotated', rotated_to_id = $2, last_used_at = now()
         where id = $1`,
        [session.sessionId, nextSessionId],
      );
      await insertAudit(client, {
        companyId: session.companyId,
        actorUserId: session.userId,
        entityId: session.familyId,
        action: "auth.refresh_succeeded",
      });
      await client.query("commit");
      return { status: "rotated", identity: session };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async findActiveIdentity(userId: string, companyId: string, familyId: string): Promise<SessionIdentity | null> {
    return withTenantTransaction(this.pool, { userId, companyId }, async (client) => {
      const result = await client.query<SessionIdentity & QueryResultRow>(
        `select
           user_account.id as "userId",
           company.id as "companyId",
           session.family_id as "familyId",
           user_account.email::text as email,
           user_account.display_name as "displayName",
           company.name as "companyName",
           membership.role
         from users as user_account
         join memberships as membership on membership.user_id = user_account.id
         join companies as company on company.id = membership.company_id
         join auth_sessions as session
           on session.user_id = user_account.id and session.company_id = company.id
         where user_account.id = $1
           and company.id = $2
           and session.family_id = $3
           and session.revoked_at is null
           and session.expires_at > now()
           and user_account.is_active = true
         limit 1`,
        [userId, companyId, familyId],
      );
      return result.rows[0] ?? null;
    });
  }

  async logout(identity: SessionIdentity, refreshTokenHash: string): Promise<boolean> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const token = await client.query<{ familyId: string } & QueryResultRow>(
        `select family_id as "familyId"
         from auth_sessions
         where refresh_token_hash = $1 and user_id = $2 and company_id = $3
         for update`,
        [refreshTokenHash, identity.userId, identity.companyId],
      );
      if (token.rows[0]?.familyId !== identity.familyId) {
        return false;
      }
      await client.query(
        `update auth_sessions
         set revoked_at = coalesce(revoked_at, now()), revocation_reason = coalesce(revocation_reason, 'logout')
         where family_id = $1 and revoked_at is null`,
        [identity.familyId],
      );
      await insertAudit(client, {
        companyId: identity.companyId,
        actorUserId: identity.userId,
        entityId: identity.familyId,
        action: "auth.logout_succeeded",
      });
      return true;
    });
  }
}
