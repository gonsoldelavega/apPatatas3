import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  createDatabaseProbe,
  type Database,
} from "../../src/database/client.js";

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

test("readiness valida todas las migraciones y sus checksums", async (t) => {
  const applied = await admin.pool.query<{
    filename: string;
    checksum: string;
    applied_at: Date;
  }>(
    `select filename,checksum,applied_at from schema_migrations
     where filename in ('0008_import_mapping_and_retention.sql','0009_sales_document_state_machine.sql')
     order by filename`,
  );
  assert.deepEqual(
    applied.rows.map((row) => row.filename),
    [
      "0008_import_mapping_and_retention.sql",
      "0009_sales_document_state_machine.sql",
    ],
  );
  await api.readiness();

  const migration = applied.rows[1]!;
  const restore = async () => {
    await admin.pool.query(
      `insert into schema_migrations(filename,checksum,applied_at) values($1,$2,$3)
       on conflict(filename) do update set checksum=excluded.checksum,applied_at=excluded.applied_at`,
      [migration.filename, migration.checksum, migration.applied_at],
    );
  };

  await t.test("falla cuando falta una migración del repositorio", async () => {
    await admin.pool.query("delete from schema_migrations where filename=$1", [
      migration.filename,
    ]);
    try {
      await assert.rejects(
        () => api.readiness(),
        /migration_missing:0009_sales_document_state_machine\.sql/,
      );
    } finally {
      await restore();
    }
  });

  await t.test("falla cuando el checksum aplicado no coincide", async () => {
    await admin.pool.query(
      "update schema_migrations set checksum=$2 where filename=$1",
      [migration.filename, "0".repeat(64)],
    );
    try {
      await assert.rejects(
        () => api.readiness(),
        /migration_checksum_mismatch:0009_sales_document_state_machine\.sql/,
      );
    } finally {
      await restore();
    }
  });

  await api.readiness();
});
