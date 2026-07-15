import assert from "node:assert/strict";
import { test } from "node:test";
import { run } from "../src/operations/process.js";

test("un disco sin espacio simulado falla sin publicar salida parcial", async () => {
  await assert.rejects(
    run(process.execPath, ["-e", "process.stdout.write('fictitious')"], { stdoutFile: "/dev/full" }),
  );
});

test("un proceso operacional interrumpido devuelve fallo sanitizado", async () => {
  await assert.rejects(
    run(process.execPath, ["-e", "process.stderr.write('postgresql://user:secret@example.test/db\\n'); process.exit(7)"]),
    (error) => error instanceof Error && error.message.includes("postgresql://[redacted]@") && !error.message.includes("user:secret"),
  );
});
