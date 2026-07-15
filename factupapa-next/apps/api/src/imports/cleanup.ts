import { Pool } from "pg";
import { pathToFileURL } from "node:url";
import { loadConfig } from "../config.js";
import { recordAudit } from "../database/audit.js";
import { setTenantContext } from "../database/client.js";
import { reportOperation } from "../operations/report-metric.js";

export interface CleanupOptions {
  companyId: string;
  userId: string;
  dryRun: boolean;
  limit: number;
  retention: { completed: number; cancelled: number; failed: number };
}

export async function cleanupImports(pool: Pool, options: CleanupOptions) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setTenantContext(client, options);
    const lock = await client.query<{ locked: boolean }>("select pg_try_advisory_xact_lock(hashtextextended($1, 0)) as locked", [`import-cleanup:${options.companyId}`]);
    if (!lock.rows[0]?.locked) throw new Error("cleanup_already_running");
    const candidates = await client.query<{ id: string; rows: number }>(
      `with candidates as (
         select batch.id, batch.created_at
         from import_batches batch
         where batch.company_id=$1 and (
           (batch.status='completed' and coalesce(batch.completed_at,batch.created_at) < now()-($2::int * interval '1 day')) or
           (batch.status='cancelled' and batch.created_at < now()-($3::int * interval '1 day')) or
           (batch.status='failed' and coalesce(batch.failed_at,batch.created_at) < now()-($4::int * interval '1 day'))
         )
         order by batch.created_at, batch.id
         limit $5
         for update skip locked
       )
       select candidate.id, count(row.id)::int as rows
       from candidates candidate
       join import_batches batch on batch.id=candidate.id
       left join import_batch_rows row on row.company_id=batch.company_id and row.batch_id=batch.id
       group by candidate.id, candidate.created_at
       order by candidate.created_at, candidate.id`,
      [options.companyId, options.retention.completed, options.retention.cancelled, options.retention.failed, options.limit],
    );
    const rows = candidates.rows.reduce((total, item) => total + item.rows, 0);
    if (!options.dryRun && candidates.rowCount) {
      await client.query("delete from import_batches where id=any($1::uuid[])", [candidates.rows.map((row) => row.id)]);
      await recordAudit(client, {
        companyId: options.companyId, actorUserId: options.userId, entityType: "import_retention", entityId: options.companyId,
        action: "import.retention_cleanup", after: { batchesDeleted: candidates.rowCount, rowsDeleted: rows, policyDays: options.retention },
      });
    }
    if (options.dryRun) await client.query("rollback"); else await client.query("commit");
    return { dryRun: options.dryRun, batches: candidates.rowCount ?? 0, rows, hasMore: (candidates.rowCount ?? 0) === options.limit };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

async function main() {
  const config = loadConfig();
  const companyId = process.env.CLEANUP_COMPANY_ID;
  const userId = process.env.CLEANUP_USER_ID;
  if (!companyId || !userId) throw new Error("CLEANUP_COMPANY_ID y CLEANUP_USER_ID son obligatorios");
  const dryRun = process.argv.includes("--dry-run");
  const pool = new Pool({ connectionString: config.databaseUrl, max: 1 });
  try {
    const result = await cleanupImports(pool, { companyId, userId, dryRun, limit: config.importCleanupLimit, retention: config.importRetentionDays });
    if (!dryRun && result.rows) await reportOperation("cleanup", "completed", result.rows);
    process.stdout.write(`${JSON.stringify({ status: "ok", ...result })}\n`);
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { process.stderr.write(`${JSON.stringify({ status: "error", error: error instanceof Error ? error.message.replace(/[\r\n]/g, " ").slice(0, 160) : "cleanup_failed" })}\n`); process.exitCode = 1; });
}
