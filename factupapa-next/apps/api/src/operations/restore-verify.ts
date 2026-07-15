import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { run } from "./process.js";
import { reportOperation } from "./report-metric.js";

const infrastructure = path.resolve(process.cwd(), "../../infrastructure");
const safeName = /^[a-z0-9][a-z0-9_-]{0,31}$/;
function compose(...args: string[]) { return run("docker", ["compose", ...args], { cwd: infrastructure }); }

export async function verifyRestore() {
  const dump = process.env.RESTORE_DUMP ? path.resolve(process.env.RESTORE_DUMP) : "";
  const environment = process.env.RESTORE_ENVIRONMENT ?? "";
  const target = process.env.RESTORE_TARGET ?? "";
  if (!dump || !safeName.test(environment) || !safeName.test(target)) throw new Error("RESTORE_DUMP, RESTORE_ENVIRONMENT y RESTORE_TARGET son obligatorios");
  if (environment === "production" || target.includes("prod")) throw new Error("La restauración de verificación no admite producción");
  if (!process.argv.includes("--confirm-isolated-restore")) throw new Error("Falta --confirm-isolated-restore");
  const manifestPath = `${dump}.manifest.json`;
  const checksumFile = await readFile(`${dump}.sha256`, "utf8");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { checksum?: { algorithm?: string; value?: string }; size?: number; latestMigration?: string };
  const fileSize = (await stat(dump)).size;
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => { const input = createReadStream(dump); input.on("data", (chunk) => hash.update(chunk)); input.once("end", resolve); input.once("error", reject); });
  const checksum = hash.digest("hex");
  if (manifest.checksum?.algorithm !== "sha256" || manifest.checksum.value !== checksum || checksumFile.trim() !== `${checksum}  ${path.basename(dump)}` || manifest.size !== fileSize || fileSize < 100) throw new Error("backup_checksum_invalid");
  await run("docker", ["compose", "exec", "-T", "postgres", "pg_restore", "--list"], { cwd: infrastructure, stdinFile: dump });
  const database = `verify_${target}_${randomBytes(4).toString("hex")}`;
  const reportDirectory = path.resolve(process.env.RESTORE_REPORT_DIRECTORY ?? path.dirname(dump));
  await mkdir(reportDirectory, { recursive: true, mode: 0o700 });
  const reportPath = path.join(reportDirectory, `restore-${database}.json`);
  let outcome: Record<string, unknown> = {};
  try {
    await compose("exec", "-T", "postgres", "sh", "-c", `PGPASSWORD=\"$POSTGRES_PASSWORD\" createdb --no-password -U \"$POSTGRES_USER\" ${database}`);
    await run("docker", ["compose", "exec", "-T", "postgres", "sh", "-c", `PGPASSWORD=\"$POSTGRES_PASSWORD\" exec pg_restore --exit-on-error --no-password --username=\"$POSTGRES_USER\" --dbname=${database}`], { cwd: infrastructure, stdinFile: dump });
    await run("docker", ["compose", "run", "--rm", "-e", `RESTORE_DATABASE_NAME=${database}`, "migrate", "sh", "-c", "export DATABASE_URL=\"${DATABASE_URL%/*}/$RESTORE_DATABASE_NAME\"; exec npm run migrate:prod"], { cwd: infrastructure });
    const checks = await compose("exec", "-T", "postgres", "sh", "-c", `PGPASSWORD=\"$POSTGRES_PASSWORD\" psql --no-psqlrc -v ON_ERROR_STOP=1 -At -U \"$POSTGRES_USER\" -d ${database} -c \"select json_build_object('migration',(select max(filename) from schema_migrations),'companies',(select count(*) from companies),'contacts',(select count(*) from contacts),'products',(select count(*) from products),'deliveryNotes',(select count(*) from delivery_notes),'invoices',(select count(*) from invoices),'auditEvents',(select count(*) from audit_events),'forcedRls',(select bool_and(relforcerowsecurity) from pg_class where relname in ('contacts','products','delivery_notes','invoices','import_mappings')),'apiBypassRls',(select rolbypassrls from pg_roles where rolname='factupapa_api'))\"`);
    outcome = JSON.parse(checks.trim()) as Record<string, unknown>;
    if (outcome.migration !== manifest.latestMigration || outcome.forcedRls !== true || outcome.apiBypassRls !== false) throw new Error("restore_schema_verification_failed");
    const withoutContext = await compose("exec", "-T", "postgres", "sh", "-c", `PGPASSWORD=\"$POSTGRES_PASSWORD\" psql --no-psqlrc -At -U \"$POSTGRES_USER\" -d ${database} -c \"set role factupapa_api; select count(*) from contacts\"`);
    const rlsCount = Number(withoutContext.trim().split(/\s+/).at(-1));
    if (rlsCount !== 0) throw new Error("restore_rls_verification_failed");
    outcome.rlsWithoutContext = "isolated";
    const tenantCounts = await compose("exec", "-T", "postgres", "sh", "-c", `PGPASSWORD=\"$POSTGRES_PASSWORD\" psql --no-psqlrc -At -U \"$POSTGRES_USER\" -d ${database} -c \"select coalesce(json_agg(x),'[]') from (select company.id as company_id,(select count(*) from contacts where company_id=company.id) as contacts,(select count(*) from products where company_id=company.id) as products,(select count(*) from delivery_notes where company_id=company.id) as delivery_notes,(select count(*) from invoices where company_id=company.id) as invoices,(select count(*) from import_batches where company_id=company.id) as imports from companies company order by company.id) x\"`);
    const report = { status: "verified", verifiedAt: new Date().toISOString(), environment, target, sourceChecksum: checksum, temporaryDatabase: database, checks: outcome, tenantCounts: JSON.parse(tenantCounts.trim()) };
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }); await chmod(reportPath, 0o600); await stat(reportPath);
    process.stdout.write(`${JSON.stringify({ status: "verified", report: reportPath })}\n`);
    return reportPath;
  } finally {
    await compose("exec", "-T", "postgres", "sh", "-c", `PGPASSWORD=\"$POSTGRES_PASSWORD\" dropdb --if-exists --force --no-password -U \"$POSTGRES_USER\" ${database}`).catch(() => undefined);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) verifyRestore().catch(async (error) => { await reportOperation("restore", "failed"); process.stderr.write(`${JSON.stringify({ status: "failed", error: error instanceof Error ? error.message.replace(/[\r\n]/g," ").slice(0,240) : "restore_failed" })}\n`); process.exitCode=1; });
