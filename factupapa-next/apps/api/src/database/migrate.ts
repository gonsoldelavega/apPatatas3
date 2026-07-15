import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import {
  defaultMigrationsDirectory,
  loadMigrationManifest,
} from "./migration-state.js";

const advisoryLockId = 1_407_202_026;

export function removeTransactionWrapper(sql: string): string {
  const withoutBegin = sql.replace(/^\s*begin\s*;\s*/i, "");
  return withoutBegin.replace(/\s*commit\s*;\s*$/i, "");
}

export interface MigrationLock {
  table: string;
  mode: "ACCESS EXCLUSIVE" | "SHARE ROW EXCLUSIVE";
}

export function migrationLockPlan(filename: string): MigrationLock[] {
  if (filename !== "0009_sales_document_state_machine.sql") return [];
  return [
    { table: "public.invoices", mode: "ACCESS EXCLUSIVE" },
    { table: "public.document_sequences", mode: "SHARE ROW EXCLUSIVE" },
  ];
}

export async function runMigrations(
  connectionString = process.env.DATABASE_URL,
  migrationsDirectory = defaultMigrationsDirectory(),
) {
  if (!connectionString) throw new Error("DATABASE_URL es obligatoria para ejecutar migraciones");

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query("select pg_advisory_lock($1)", [advisoryLockId]);
    await client.query(`
      create table if not exists schema_migrations (
        filename text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);

    const migrations = await loadMigrationManifest(migrationsDirectory);

    for (const { filename, checksum } of migrations) {
      const sql = await readFile(path.join(migrationsDirectory, filename), "utf8");
      const executableSql = removeTransactionWrapper(sql);
      const applied = await client.query<{ checksum: string }>(
        "select checksum from schema_migrations where filename = $1",
        [filename],
      );

      if (applied.rowCount) {
        if (applied.rows[0]?.checksum !== checksum) {
          throw new Error(`La migración aplicada ${filename} ha cambiado`);
        }
        console.log(`omitida ${filename}`);
        continue;
      }

      await client.query("begin");
      try {
        if (filename > "0003_row_level_security.sql") {
          await client.query("set local role factupapa_migrator");
        }
        const lockPlan = migrationLockPlan(filename);
        if (lockPlan.length) {
          await client.query("set local lock_timeout = '5s'");
          for (const lock of lockPlan) {
            await client.query(`lock table ${lock.table} in ${lock.mode} mode`);
          }
        }
        await client.query(executableSql);
        await client.query("insert into schema_migrations(filename, checksum) values ($1, $2)", [filename, checksum]);
        await client.query("commit");
        console.log(`aplicada ${filename}`);
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock($1)", [advisoryLockId]).catch(() => undefined);
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrations().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
