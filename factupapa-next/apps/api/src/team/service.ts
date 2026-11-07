import type { Pool } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { HttpError } from "../http/errors.js";
import { OWNER_ROLE } from "../authz/partner-policy.js";

export interface TeamMember {
  id: string;
  email: string;
  role: "partner";
  createdAt: string;
  lastLoginAt: string | null;
  registered: boolean;
  welcomeMessage: string | null;
}

export const MAX_PARTNERS = 3;

function requireOwner(identity: SessionIdentity): void {
  if (identity.role !== OWNER_ROLE) throw new HttpError("forbidden", 403);
}

function mapDatabaseError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (message === "forbidden") throw new HttpError("forbidden", 403);
  if (message === "invalid_email" || message === "invalid_welcome") throw new HttpError("invalid_request", 400);
  if (message === "team_limit_reached") throw new HttpError("team_limit_reached", 409);
  if (message === "already_member") throw new HttpError("team_member_exists", 409);
  if (message === "cannot_change_owner") throw new HttpError("team_owner_protected", 409);
  if (message === "not_found") throw new HttpError("not_found", 404);
  throw error;
}

interface Row {
  id: string;
  email: string;
  role: "partner";
  created_at: Date | string;
  last_login_at?: Date | string | null;
  registered?: boolean;
  welcome_message?: string | null;
}

const iso = (value: Date | string | null | undefined): string | null =>
  value ? new Date(value).toISOString() : null;

/** Gestión de los socios (rol partner). Solo el usuario maestro (owner). */
export class TeamService {
  constructor(private readonly pool: Pool) {}

  async list(identity: SessionIdentity): Promise<{ items: TeamMember[]; limit: number }> {
    requireOwner(identity);
    try {
      const result = await this.pool.query<Row>(
        "select id, email, role, created_at, last_login_at, registered, welcome_message from team_list_members($1, $2)",
        [identity.companyId, identity.userId],
      );
      return {
        limit: MAX_PARTNERS,
        items: result.rows.map((row) => ({
          id: row.id,
          email: row.email,
          role: row.role,
          createdAt: iso(row.created_at) as string,
          lastLoginAt: iso(row.last_login_at),
          registered: Boolean(row.registered),
          welcomeMessage: row.welcome_message ?? null,
        })),
      };
    } catch (error) {
      return mapDatabaseError(error);
    }
  }

  async add(identity: SessionIdentity, email: string, welcomeMessage?: string | null): Promise<TeamMember> {
    requireOwner(identity);
    try {
      const result = await this.pool.query<Row>(
        "select id, email, role, created_at from team_add_partner($1, $2, $3)",
        [identity.companyId, identity.userId, email],
      );
      const row = result.rows[0];
      if (!row) throw new HttpError("invalid_request", 400);
      const welcome = welcomeMessage?.trim() || null;
      if (welcome) {
        await this.pool.query("select team_set_welcome($1, $2, $3, $4)", [
          identity.companyId,
          identity.userId,
          row.id,
          welcome,
        ]);
      }
      return {
        id: row.id,
        email: row.email,
        role: row.role,
        createdAt: iso(row.created_at) as string,
        lastLoginAt: null,
        registered: false,
        welcomeMessage: welcome,
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      return mapDatabaseError(error);
    }
  }

  async setWelcome(identity: SessionIdentity, accessId: string, message: string | null): Promise<void> {
    requireOwner(identity);
    try {
      await this.pool.query("select team_set_welcome($1, $2, $3, $4)", [
        identity.companyId,
        identity.userId,
        accessId,
        message,
      ]);
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  /** Mensaje de bienvenida del propio socio (null para el maestro o si no tiene). */
  async myWelcome(identity: SessionIdentity): Promise<string | null> {
    const result = await this.pool.query<{ message: string | null }>(
      "select team_my_welcome($1) as message",
      [identity.userId],
    );
    return result.rows[0]?.message ?? null;
  }

  async remove(identity: SessionIdentity, accessId: string): Promise<void> {
    requireOwner(identity);
    try {
      await this.pool.query("select team_remove_partner($1, $2, $3)", [
        identity.companyId,
        identity.userId,
        accessId,
      ]);
    } catch (error) {
      mapDatabaseError(error);
    }
  }
}
