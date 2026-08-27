import assert from "node:assert/strict";
import { test } from "node:test";
import {
  migrationLockPlan,
  removeTransactionWrapper,
} from "../src/database/migrate.js";
import { assertMigrationState } from "../src/database/migration-state.js";

test("el migrador elimina el envoltorio transaccional heredado", () => {
  assert.equal(
    removeTransactionWrapper("begin;\nselect 1;\ncommit;\n"),
    "select 1;",
  );
});

test("el migrador conserva SQL sin envoltorio transaccional", () => {
  assert.equal(removeTransactionWrapper("select 1;\n"), "select 1;\n");
});

test("0009 adquiere locks en el mismo orden que la emisión", () => {
  assert.deepEqual(migrationLockPlan("0009_sales_document_state_machine.sql"), [
    { table: "public.invoices", mode: "ACCESS EXCLUSIVE" },
    { table: "public.document_sequences", mode: "SHARE ROW EXCLUSIVE" },
  ]);
  assert.deepEqual(migrationLockPlan("0010_other.sql"), []);
});

test("readiness acepta exactamente el manifiesto aplicado", () => {
  const manifest = [
    { filename: "0008_import_mapping_and_retention.sql", checksum: "a" },
    { filename: "0009_sales_document_state_machine.sql", checksum: "b" },
  ];
  assert.doesNotThrow(() => assertMigrationState(manifest, manifest));
});

test("readiness detecta una migración pendiente", () => {
  assert.throws(
    () =>
      assertMigrationState(
        [
          { filename: "0008_import_mapping_and_retention.sql", checksum: "a" },
          { filename: "0009_sales_document_state_machine.sql", checksum: "b" },
        ],
        [{ filename: "0008_import_mapping_and_retention.sql", checksum: "a" }],
      ),
    /migration_missing:0009_sales_document_state_machine\.sql/,
  );
});

test("readiness detecta checksum incorrecto", () => {
  assert.throws(
    () =>
      assertMigrationState(
        [{ filename: "0009_sales_document_state_machine.sql", checksum: "correcto" }],
        [{ filename: "0009_sales_document_state_machine.sql", checksum: "alterado" }],
      ),
    /migration_checksum_mismatch:0009_sales_document_state_machine\.sql/,
  );
});

test("readiness permite la migración futura conocida de staging", () => {
  assert.doesNotThrow(() =>
    assertMigrationState(
      [{ filename: "0023_gmail_inbox_cursor_and_metrics.sql", checksum: "a" }],
      [
        { filename: "0023_gmail_inbox_cursor_and_metrics.sql", checksum: "a" },
        {
          filename: "0022_gmail_document_safety.sql",
          checksum: "2d6f02db41868361d447904d05d8a63945f04107f33ab956137e50f0bb14c7ee",
        },
        {
          filename: "0024_purchase_soft_delete.sql",
          checksum: "ddfb33c167c15710a7301efbbf3f5228db192b65e8ba2a8f812d4fa890e89c06",
        },
      ],
    ),
  );
});

test("readiness sigue rechazando migraciones futuras desconocidas", () => {
  assert.throws(
    () =>
      assertMigrationState(
        [{ filename: "0023_gmail_inbox_cursor_and_metrics.sql", checksum: "a" }],
        [
          { filename: "0023_gmail_inbox_cursor_and_metrics.sql", checksum: "a" },
          { filename: "9999_unexpected.sql", checksum: "f" },
        ],
      ),
    /migration_unexpected:9999_unexpected\.sql/,
  );
});
