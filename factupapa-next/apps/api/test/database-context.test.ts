import assert from "node:assert/strict";
import test from "node:test";
import type { Pool, PoolClient } from "pg";
import { withTenantTransaction } from "../src/database/client.js";

const context = {
  companyId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
};

function fakeDatabase(failOperation = false): {
  pool: Pool;
  statements: string[];
  released: () => boolean;
} {
  const statements: string[] = [];
  let wasReleased = false;
  const client = {
    async query(sql: string) {
      statements.push(sql.replace(/\s+/g, " ").trim());
      if (failOperation && sql === "operation")
        throw new Error("operation failed");
      return { rows: [], rowCount: 0 };
    },
    release() {
      wasReleased = true;
    },
  } as unknown as PoolClient;
  const pool = {
    async connect() {
      return client;
    },
  } as unknown as Pool;
  return { pool, statements, released: () => wasReleased };
}

test("el contexto se establece localmente dentro de begin/commit", async () => {
  const fake = fakeDatabase();
  await withTenantTransaction(fake.pool, context, (client) =>
    client.query("operation"),
  );
  assert.equal(fake.statements[0], "begin");
  assert.match(
    fake.statements[1]!,
    /set_config\('app\.current_company_id'.*true\)/,
  );
  assert.match(
    fake.statements[1]!,
    /set_config\('app\.current_user_id'.*true\)/,
  );
  assert.equal(fake.statements[2], "operation");
  assert.equal(fake.statements[3], "commit");
  assert.equal(fake.released(), true);
});

test("una operación fallida hace rollback y libera la conexión", async () => {
  const fake = fakeDatabase(true);
  await assert.rejects(
    withTenantTransaction(fake.pool, context, (client) =>
      client.query("operation"),
    ),
    /operation failed/,
  );
  assert.equal(fake.statements.at(-1), "rollback");
  assert.equal(fake.statements.includes("commit"), false);
  assert.equal(fake.released(), true);
});
