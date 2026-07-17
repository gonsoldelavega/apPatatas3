import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  createDatabaseProbe,
  type Database,
} from "../../src/database/client.js";
import { loadMigrationManifest } from "../../src/database/migration-state.js";
import { createReadiness } from "../../src/health/readiness.js";

const adminUrl = process.env.DATABASE_ADMIN_URL;
const apiUrl = process.env.DATABASE_URL;
let admin: Database;
let api: Database;

before(() => {
  assert.ok(adminUrl && apiUrl);
  admin = createDatabaseProbe(adminUrl);
  api = createDatabaseProbe(apiUrl);
});

after(async () => {
  if (api) await api.close();
  if (admin) await admin.close();
});

test("readiness valida el manifiesto dinámico completo", async (t) => {
  const readiness = createReadiness({ database: api, timeoutMs: 3_000 });
  const manifest = await loadMigrationManifest();
  const expectedFilenames = manifest.map((migration) => migration.filename);
  const applied = await admin.pool.query<{
    filename: string;
    checksum: string;
    applied_at: Date;
  }>(
    "select filename,checksum,applied_at from schema_migrations order by filename",
  );
  assert.deepEqual(
    applied.rows.map((row) => row.filename),
    expectedFilenames,
  );
  await api.readiness();
  assert.equal((await readiness.check()).postgresql, "ok");

  const migration = applied.rows.at(-1);
  assert.ok(migration, "debe existir una migración más reciente");
  const unexpectedFilename = "9999_unexpected_audit_migration.sql";
  const restore = async () => {
    await admin.pool.query("delete from schema_migrations where filename=$1", [
      unexpectedFilename,
    ]);
    await admin.pool.query(
      `insert into schema_migrations(filename,checksum,applied_at) values($1,$2,$3)
       on conflict(filename) do update set checksum=excluded.checksum,applied_at=excluded.applied_at`,
      [migration.filename, migration.checksum, migration.applied_at],
    );
  };

  await t.test(
    "la migración más reciente ausente produce migration_incomplete",
    async () => {
      await admin.pool.query(
        "delete from schema_migrations where filename=$1",
        [migration.filename],
      );
      try {
        assert.equal((await readiness.check()).postgresql, "incomplete");
        await assert.rejects(
          () => api.readiness(),
          new RegExp(
            `migration_missing:${migration.filename.replace(".", "\\.")}`,
          ),
        );
      } finally {
        await restore();
      }
    },
  );

  await t.test(
    "checksum incorrecto de la migración más reciente produce migration_incomplete",
    async () => {
      await admin.pool.query(
        "update schema_migrations set checksum=$2 where filename=$1",
        [migration.filename, "0".repeat(64)],
      );
      try {
        assert.equal((await readiness.check()).postgresql, "incomplete");
        await assert.rejects(
          () => api.readiness(),
          new RegExp(
            `migration_checksum_mismatch:${migration.filename.replace(".", "\\.")}`,
          ),
        );
      } finally {
        await restore();
      }
    },
  );

  await t.test(
    "una migración inesperada produce migration_incomplete",
    async () => {
      await admin.pool.query(
        "insert into schema_migrations(filename,checksum) values($1,$2)",
        [unexpectedFilename, "f".repeat(64)],
      );
      try {
        assert.equal((await readiness.check()).postgresql, "incomplete");
        await assert.rejects(
          () => api.readiness(),
          /migration_unexpected:9999_unexpected_audit_migration\.sql/,
        );
      } finally {
        await restore();
      }
    },
  );

  await api.readiness();
  assert.equal((await readiness.check()).postgresql, "ok");
});
