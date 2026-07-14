import { Pool } from "pg";

export interface DatabaseProbe {
  check(): Promise<void>;
  close(): Promise<void>;
}

export function createDatabaseProbe(connectionString: string): DatabaseProbe {
  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 3_000,
    query_timeout: 3_000,
  });

  return {
    async check() {
      await pool.query("select 1");
    },
    async close() {
      await pool.end();
    },
  };
}
