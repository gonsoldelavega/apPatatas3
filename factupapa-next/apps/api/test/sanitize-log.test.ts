import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execute = promisify(execFile);

test("el sanitizador elimina credenciales, cabeceras, cookies y rutas internas", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "factupapa-sanitize-"));
  const input = path.join(directory, "raw.log");
  const output = path.join(directory, "clean.log");
  const env = path.join(directory, ".env");
  const secret = "fictitious-secret-value-123456789";
  try {
    await writeFile(
      env,
      [
        `POSTGRES_PASSWORD=${secret}`,
        "JWT_SECRET=fictitious-jwt-value-123456789",
        "S3_ACCESS_KEY=fictitious-storage-user",
      ].join("\n"),
    );
    await writeFile(
      input,
      [
        `password=${secret}`,
        "Authorization: Bearer fictitious.jwt.token",
        "Cookie: factupapa_refresh=fictitious-cookie",
        "postgresql://audit-user:audit-password@postgres:5432/database",
        `artifact=/${"home"}/factupapa/actions-runner/_work/private/report.json`,
        `windows=C:${"\\Users"}\\runner\\private\\report.json`,
        "useful diagnostic: restore completed",
      ].join("\n"),
    );

    await execute(process.execPath, [
      path.resolve("../../scripts/sanitize-diagnostic-log.mjs"),
      input,
      output,
      env,
    ]);
    const sanitized = await readFile(output, "utf8");
    for (const forbidden of [
      secret,
      "fictitious.jwt.token",
      "fictitious-cookie",
      "audit-password",
      `/${"home"}/factupapa`,
      `C:${"\\Users"}\\runner`,
      "Authorization",
    ]) {
      assert.equal(sanitized.includes(forbidden), false, forbidden);
    }
    assert.match(sanitized, /useful diagnostic: restore completed/);
    assert.match(sanitized, /\[internal-path\]/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
