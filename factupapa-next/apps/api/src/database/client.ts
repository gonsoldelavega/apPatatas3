import { Pool } from "pg";

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
