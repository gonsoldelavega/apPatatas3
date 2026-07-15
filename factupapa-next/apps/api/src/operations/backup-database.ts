import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, mkdir, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { run } from "./process.js";
import { reportOperation } from "./report-metric.js";

const infrastructure = path.resolve(process.cwd(), "../../infrastructure");
const migrations = path.resolve(process.cwd(), "../../packages/database");
const safeEnvironment = /^[a-z0-9][a-z0-9_-]{0,31}$/;

async function sha256(filename: string) {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => { const input = createReadStream(filename); input.on("data", (chunk) => hash.update(chunk)); input.once("end", resolve); input.once("error", reject); });
  return hash.digest("hex");
}
async function latestMigration() { return (await readdir(migrations)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort().at(-1) ?? "unknown"; }
function compose(...args: string[]) { return run("docker", ["compose", ...args], { cwd: infrastructure }); }

export async function backupDatabase() {
  const environment = process.env.BACKUP_ENVIRONMENT ?? "integration";
  if (!safeEnvironment.test(environment)) throw new Error("BACKUP_ENVIRONMENT no es válido");
  const directory = path.resolve(process.env.BACKUP_DIRECTORY ?? path.join(infrastructure, ".backups"));
  await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory, 0o700);
  const migration = await latestMigration();
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const id = randomBytes(4).toString("hex");
  const stem = `factupapa-${timestamp}-${environment}-${migration.replace(/\.sql$/, "")}-${id}`;
  const temporary = path.join(directory, `.${stem}.partial`);
  const dump = path.join(directory, `${stem}.dump`);
  const manifestPath = `${dump}.manifest.json`;
  const checksumPath = `${dump}.sha256`;
  try {
    await run("docker", ["compose", "exec", "-T", "postgres", "sh", "-c", "PGPASSWORD=\"$POSTGRES_PASSWORD\" exec pg_dump --format=custom --compress=9 --no-password --username=\"$POSTGRES_USER\" --dbname=\"$POSTGRES_DB\""], { cwd: infrastructure, stdoutFile: temporary });
    await run("docker", ["compose", "exec", "-T", "postgres", "pg_restore", "--list"], { cwd: infrastructure, stdinFile: temporary });
    const size = (await stat(temporary)).size;
    if (size < 100) throw new Error("backup_incomplete");
    const checksum = await sha256(temporary);
    const database = (await compose("exec", "-T", "postgres", "sh", "-c", "PGPASSWORD=\"$POSTGRES_PASSWORD\" psql --no-psqlrc -At -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -c 'select current_database()'")).trim();
    const postgresVersion = (await compose("exec", "-T", "postgres", "postgres", "--version")).trim();
    const appliedMigration = (await compose("exec", "-T", "postgres", "sh", "-c", "PGPASSWORD=\"$POSTGRES_PASSWORD\" psql --no-psqlrc -At -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -c 'select coalesce(max(filename), '\"'\"'none'\"'\"') from schema_migrations'")).trim();
    await rename(temporary, dump); await chmod(dump, 0o600);
    await writeFile(checksumPath, `${checksum}  ${path.basename(dump)}\n`, { mode: 0o600, flag: "wx" });
    const manifest = { createdAt: new Date().toISOString(), environment, schemaVersion: migration, size, checksum: { algorithm: "sha256", value: checksum }, database, postgresVersion, latestMigration: appliedMigration, filename: path.basename(dump) };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await rotate(directory, dump, manifestPath);
    process.stdout.write(`${JSON.stringify({ status: "verified", dump, manifest: manifestPath, checksumFile: checksumPath, size, checksum })}\n`);
    return { dump, manifest: manifestPath };
  } catch (error) {
    await Promise.all([temporary, dump, manifestPath, checksumPath].map((file) => unlink(file).catch(() => undefined)));
    throw error;
  }
}

async function rotate(directory: string, currentDump: string, currentManifest: string) {
  const maximum = Number(process.env.BACKUP_MAX_COPIES ?? "14");
  const maximumAgeDays = Number(process.env.BACKUP_MAX_AGE_DAYS ?? "30");
  if (!Number.isInteger(maximum) || maximum < 1 || !Number.isFinite(maximumAgeDays) || maximumAgeDays < 1) throw new Error("Política de rotación inválida");
  const dryRun = process.argv.includes("--rotation-dry-run");
  const entries = await Promise.all((await readdir(directory)).filter((name) => name.endsWith(".dump")).map(async (name) => ({ name, modified: (await stat(path.join(directory, name))).mtimeMs })));
  entries.sort((a, b) => b.modified - a.modified || b.name.localeCompare(a.name));
  const cutoff = Date.now() - maximumAgeDays * 86_400_000;
  const expired: string[] = [];
  let retained = 1;
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (file === currentDump) continue;
    if (retained >= maximum || entry.modified < cutoff) expired.push(file);
    else retained += 1;
  }
  for (const file of expired) {
    process.stdout.write(`${JSON.stringify({ event: "backup.rotation", dryRun, filename: path.basename(file) })}\n`);
    if (!dryRun) { await unlink(file); await unlink(`${file}.manifest.json`).catch(() => undefined); await unlink(`${file}.sha256`).catch(() => undefined); }
  }
  await stat(currentDump); await stat(currentManifest);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) backupDatabase().catch(async (error) => { await reportOperation("backup", "failed"); process.stderr.write(`${JSON.stringify({ status: "failed", error: error instanceof Error ? error.message.replace(/[\r\n]/g," ").slice(0,240) : "backup_failed" })}\n`); process.exitCode = 1; });
