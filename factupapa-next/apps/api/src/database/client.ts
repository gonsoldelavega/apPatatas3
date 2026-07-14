import { Pool, type PoolClient } from "pg";

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
}

export function createDatabaseProbe(connectionString: string): Database {
  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 3_000,
    query_timeout: 3_000,
  });

  return {
    pool,
    async check() {
      await pool.query("select 1");
    },
    async close() {
      await pool.end();
    },
  };
}
