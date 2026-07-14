import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/config.js";

test("la configuración exige DATABASE_URL", () => {
  assert.throws(() => loadConfig({}), /DATABASE_URL es obligatoria/);
});

test("la configuración rechaza puertos no válidos", () => {
  assert.throws(
    () => loadConfig({ DATABASE_URL: "postgresql://localhost/test", APP_PORT: "70000" }),
    /APP_PORT debe ser un puerto válido/,
  );
});

test("la configuración aplica valores predeterminados seguros", () => {
  assert.deepEqual(loadConfig({ DATABASE_URL: "postgresql://localhost/test" }), {
    host: "0.0.0.0",
    port: 4100,
    databaseUrl: "postgresql://localhost/test",
    appVersion: "development",
  });
});
