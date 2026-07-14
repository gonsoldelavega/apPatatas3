import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

const advisoryLockId = 1_407_202_026;

export function removeTransactionWrapper(sql: string): string {
  const withoutBegin = sql.replace(/^\s*begin\s*;\s*/i, "");
  return withoutBegin.replace(/\s*commit\s*;\s*$/i, "");
}

export async function runMigrations(
  connectionString = process.env.DATABASE_URL,
  migrationsDirectory = process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "../../packages/database"),
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

    const filenames = (await readdir(migrationsDirectory))
      .filter((filename) => /^\d{4}_[a-z0-9_]+\.sql$/.test(filename))
      .sort();

    for (const filename of filenames) {
      const sql = await readFile(path.join(migrationsDirectory, filename), "utf8");
      const executableSql = removeTransactionWrapper(sql);
      const checksum = createHash("sha256").update(sql).digest("hex");
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
