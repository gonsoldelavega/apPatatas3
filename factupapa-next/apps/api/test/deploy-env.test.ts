import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// El despliegue guarda cada variable en el .env privado con upsert_private_environment_value y luego lo lee con
// `source`. Un valor con `&` (la URL del Registro Maestro) sin comillas se perdía y la app arrancaba sin ella.
const script = readFileSync(path.resolve(process.cwd(), "../../scripts/deploy-private-staging.sh"), "utf8");
const fn = script.match(/upsert_private_environment_value\(\) \{[\s\S]*?\n\}\n/)?.[0];

test("el despliegue guarda y relee valores con &, ? y comillas sin perderlos", () => {
  assert.ok(fn, "no se encontró upsert_private_environment_value en el script de despliegue");
  const dir = mkdtempSync(path.join(tmpdir(), "upsert-"));
  const envFile = path.join(dir, ".env");
  writeFileSync(envFile, "A='uno'\nPURCHASE_REGISTRY_WEBAPP_URL=viejo\n");
  const url = "https://docs.google.com/spreadsheets/d/XYZ/export?format=csv&gid=1933250843";
  const run = spawnSync("bash", ["-c", `
    set -euo pipefail
    environment_file="${envFile}"
    ${fn}
    upsert_private_environment_value PURCHASE_REGISTRY_WEBAPP_URL "${url}"
    upsert_private_environment_value OTRA "con 'comilla' y espacio"
    upsert_private_environment_value A "dos"
    set -a; source "${envFile}"; set +a
    printf '%s\\n%s\\n%s\\n' "$PURCHASE_REGISTRY_WEBAPP_URL" "$OTRA" "$A"
  `], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.stdout.trim().split("\n"), [url, "con 'comilla' y espacio", "dos"]);
  assert.equal(readFileSync(envFile, "utf8").split("\n").filter((l) => l.startsWith("PURCHASE_REGISTRY_WEBAPP_URL=")).length, 1, "sin duplicar la clave");
});
