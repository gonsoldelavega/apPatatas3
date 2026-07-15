import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface MigrationManifestEntry {
  filename: string;
  checksum: string;
}

export const migrationFilenamePattern = /^\d{4}_[a-z0-9_]+\.sql$/;

export function defaultMigrationsDirectory(): string {
  return (
    process.env.MIGRATIONS_DIR ??
    path.resolve(process.cwd(), "../../packages/database")
  );
}

export async function loadMigrationManifest(
  migrationsDirectory = defaultMigrationsDirectory(),
): Promise<MigrationManifestEntry[]> {
  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => migrationFilenamePattern.test(filename))
    .sort();

  return Promise.all(
    filenames.map(async (filename) => ({
      filename,
      checksum: createHash("sha256")
        .update(await readFile(path.join(migrationsDirectory, filename), "utf8"))
        .digest("hex"),
    })),
  );
}

export function assertMigrationState(
  expected: MigrationManifestEntry[],
  applied: MigrationManifestEntry[],
): void {
  const appliedByFilename = new Map(
    applied.map((migration) => [migration.filename, migration.checksum]),
  );
  for (const migration of expected) {
    const checksum = appliedByFilename.get(migration.filename);
    if (checksum === undefined) throw new Error(`migration_missing:${migration.filename}`);
    if (checksum !== migration.checksum)
      throw new Error(`migration_checksum_mismatch:${migration.filename}`);
  }
  const expectedFilenames = new Set(
    expected.map((migration) => migration.filename),
  );
  const unexpected = applied.find((migration) => !expectedFilenames.has(migration.filename));
  if (unexpected) throw new Error(`migration_unexpected:${unexpected.filename}`);
}
