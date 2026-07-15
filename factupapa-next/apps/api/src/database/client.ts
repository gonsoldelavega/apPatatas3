import { Pool, type PoolClient } from "pg";
import {
  assertMigrationState,
  defaultMigrationsDirectory,
  loadMigrationManifest,
  type MigrationManifestEntry,
} from "./migration-state.js";

export interface TenantContext {
  companyId: string;
  userId: string;
}

export async function setTenantContext(client: PoolClient, context: TenantContext): Promise<void> {
  await client.query(
    `select
       set_config('app.current_company_id', $1::uuid::text, true),
       set_config('app.current_user_id', $2::uuid::text, true)`,
    [context.companyId, context.userId],
  );
}

export async function withTenantTransaction<T>(
  pool: Pool,
  context: TenantContext,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setTenantContext(client, context);
    const result = await operation(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export interface DatabaseProbe {
  check(): Promise<void>;
  close(): Promise<void>;
}

export interface Database extends DatabaseProbe {
  pool: Pool;
  readiness(): Promise<void>;
}

export function createDatabaseProbe(
  connectionString: string,
  migrationsDirectory = defaultMigrationsDirectory(),
): Database {
  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 3_000,
    query_timeout: 3_000,
  });
  let expectedMigrations: ReturnType<typeof loadMigrationManifest> | undefined;

  return {
    pool,
    async check() {
      await pool.query("select 1");
    },
    async readiness() {
      const [manifest, migrations, role] = await Promise.all([
        (expectedMigrations ??= loadMigrationManifest(migrationsDirectory)),
        pool.query<MigrationManifestEntry>(
          "select filename, checksum from schema_migrations order by filename",
        ),
        pool.query<{ bypass: boolean; role: string }>(
          `select rolbypassrls as bypass, current_user as role
           from pg_roles where rolname=current_user`,
        ),
      ]);
      assertMigrationState(manifest, migrations.rows);
      const state = role.rows[0];
      if (!state || state.bypass || state.role === "factupapa_migrator")
        throw new Error("api_role_invalid");
    },
    async close() {
      await pool.end();
    },
  };
}
