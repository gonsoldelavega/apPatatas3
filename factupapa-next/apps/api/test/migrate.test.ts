import assert from "node:assert/strict";
import { test } from "node:test";
import { removeTransactionWrapper } from "../src/database/migrate.js";

test("el migrador elimina el envoltorio transaccional heredado", () => {
  assert.equal(removeTransactionWrapper("begin;\nselect 1;\ncommit;\n"), "select 1;");
});

test("el migrador conserva SQL sin envoltorio transaccional", () => {
  assert.equal(removeTransactionWrapper("select 1;\n"), "select 1;\n");
});
