import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// docker compose solo pasa al contenedor las variables listadas en `environment:`. Si falta una, el servidor
// la lee vacía aunque esté en el .env (así dejó de importarse el Registro Maestro).
const compose = readFileSync(path.resolve(process.cwd(), "../../infrastructure/docker-compose.yml"), "utf8");

for (const variable of ["PURCHASE_REGISTRY_WEBAPP_URL", "PURCHASE_REGISTRY_WEBAPP_TOKEN", "DRIVE_LIBRARY_FOLDER_ID", "OWN_TAX_IDS"]) {
  test(`el contenedor api recibe ${variable}`, () => {
    assert.match(compose, new RegExp(`^\\s+${variable}: \\$\\{${variable}:-`, "m"));
  });
}
