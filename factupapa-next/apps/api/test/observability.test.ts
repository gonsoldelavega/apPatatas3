import assert from "node:assert/strict";
import { test } from "node:test";
import { log, normalizePath } from "../src/observability/logger.js";

test("normaliza identificadores de ruta", () => {
  assert.equal(normalizePath("/invoices/3d9a3434-39ea-42f0-ae93-dc188c0ae627/lines/42"), "/invoices/:id/lines/:number");
});

test("el logger JSON elimina secretos, controles e inyección de líneas", () => {
  let written = "";
  const original = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => { written += String(chunk); return true; }) as typeof process.stdout.write;
  try { log("error", { requestId: "safe\nforged", errorCode: "failure\rnext", password: "never-log-this", authorization: "Bearer never" }); }
  finally { process.stdout.write = original; }
  assert.equal(written.split("\n").filter(Boolean).length, 1);
  const entry = JSON.parse(written) as Record<string, unknown>;
  assert.equal(entry.requestId, "safe forged");
  assert.equal(entry.errorCode, "failure next");
  assert.equal("password" in entry, false);
  assert.equal("authorization" in entry, false);
});
